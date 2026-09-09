import { randomUUID } from 'node:crypto';

import type { ClientSession } from 'mongoose';

import SystemConfig from '../models/SystemConfig';
import UploadReservation from '../models/UploadReservation';
import User from '../models/User';
import VoiceNote from '../models/VoiceNote';
import {
  DEFAULT_RETENTION_SETTINGS,
  getRetentionScheduleKey,
  parseRetentionSettings,
  RETENTION_BATCH_LIMIT,
  RETENTION_CONFIG_KEY,
  type RetentionConfiguration,
  type RetentionExecutionReport,
  type RetentionPreview,
  type RetentionSettings,
} from '../types/retention';
import { collectStorageDeletionTargets } from './storageDeletionTargets';
import { findSharedStorageKeys } from './storageReferenceSafety';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  releaseVoiceNoteSlot,
  withStorageTransaction,
} from './storageProtocol';
import { normalizeStorageKey } from './storageValidation';
import connectToDatabase from './mongodb';
import { isRecord } from './security/input';

const RETENTION_LEASE_MS = 5 * 60 * 1000;
const RETENTION_RETRY_DELAY_MS = 5 * 60 * 1000;

type RetentionRecord = {
  retentionSettings?: unknown;
  retentionLastReport?: unknown;
};

type RetentionAgeOverrides = Partial<Record<
  'playedVoiceNotes' | 'unplayedVoiceNotes' | 'audioBroadcasts' | 'unusedPdfUploads',
  number
>>;

type QueuedTarget = { key: string; bytes: number; reason: string };

type VoiceRetentionPlan = {
  noteIds: unknown[];
  slots: Array<{ ownerId: string; projectId: string }>;
  targets: QueuedTarget[];
  skippedInvalidObjects: number;
  protectedSharedObjects: number;
};

type BroadcastRetentionPlan = {
  supervisorIds: unknown[];
  targets: QueuedTarget[];
  skippedInvalidObjects: number;
  protectedSharedObjects: number;
};

type PdfRetentionPlan = {
  reservationIds: unknown[];
  targets: QueuedTarget[];
  skippedInvalidObjects: number;
  protectedSharedObjects: number;
};

type RetentionPlan = {
  playedVoiceNotes: VoiceRetentionPlan;
  unplayedVoiceNotes: VoiceRetentionPlan;
  audioBroadcasts: BroadcastRetentionPlan;
  unusedPdfUploads: PdfRetentionPlan;
};

function emptyVoicePlan(): VoiceRetentionPlan {
  return { noteIds: [], slots: [], targets: [], skippedInvalidObjects: 0, protectedSharedObjects: 0 };
}

function emptyBroadcastPlan(): BroadcastRetentionPlan {
  return { supervisorIds: [], targets: [], skippedInvalidObjects: 0, protectedSharedObjects: 0 };
}

function emptyPdfPlan(): PdfRetentionPlan {
  return { reservationIds: [], targets: [], skippedInvalidObjects: 0, protectedSharedObjects: 0 };
}

function emptyReport(status: RetentionExecutionReport['status'], scheduledFor: string | null): RetentionExecutionReport {
  return {
    status,
    scheduledFor,
    completedAt: status === 'completed' || status === 'failed' ? new Date().toISOString() : null,
    playedVoiceNotesDeleted: 0,
    unplayedVoiceNotesDeleted: 0,
    audioBroadcastsCleared: 0,
    unusedPdfUploadsQueued: 0,
    queuedObjects: 0,
    queuedDeletionBytes: 0,
    protectedSharedObjects: 0,
    skippedInvalidObjects: 0,
  };
}

function safeCount(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function readStoredReport(value: unknown): RetentionExecutionReport | null {
  if (!isRecord(value)) return null;
  const report = value;
  const status = report.status;
  if (
    status !== 'completed' && status !== 'failed' && status !== 'disabled'
    && status !== 'not-configured' && status !== 'not-due' && status !== 'running'
  ) {
    return null;
  }

  const completedAt = report.completedAt ? new Date(String(report.completedAt)) : null;
  return {
    status,
    scheduledFor: typeof report.scheduledFor === 'string' ? report.scheduledFor : null,
    completedAt: completedAt && !Number.isNaN(completedAt.getTime()) ? completedAt.toISOString() : null,
    playedVoiceNotesDeleted: safeCount(report.playedVoiceNotesDeleted),
    unplayedVoiceNotesDeleted: safeCount(report.unplayedVoiceNotesDeleted),
    audioBroadcastsCleared: safeCount(report.audioBroadcastsCleared),
    unusedPdfUploadsQueued: safeCount(report.unusedPdfUploadsQueued),
    queuedObjects: safeCount(report.queuedObjects),
    queuedDeletionBytes: safeCount(report.queuedDeletionBytes),
    protectedSharedObjects: safeCount(report.protectedSharedObjects),
    skippedInvalidObjects: safeCount(report.skippedInvalidObjects),
  };
}

function serializeConfiguration(record: RetentionRecord | null): RetentionConfiguration {
  if (!record?.retentionSettings) {
    return {
      configured: false,
      invalid: false,
      settings: DEFAULT_RETENTION_SETTINGS,
      lastReport: null,
    };
  }

  try {
    return {
      configured: true,
      invalid: false,
      settings: parseRetentionSettings(record.retentionSettings),
      lastReport: readStoredReport(record.retentionLastReport),
    };
  } catch {
    return {
      configured: false,
      invalid: true,
      settings: DEFAULT_RETENTION_SETTINGS,
      lastReport: readStoredReport(record.retentionLastReport),
    };
  }
}

export async function getRetentionConfiguration() {
  await connectToDatabase();
  const record = await SystemConfig.findOne({ configKey: RETENTION_CONFIG_KEY })
    .select('retentionSettings retentionLastReport')
    .lean<RetentionRecord>();
  return serializeConfiguration(record);
}

export async function saveRetentionSettings(settings: RetentionSettings) {
  await connectToDatabase();
  const record = await SystemConfig.findOneAndUpdate(
    { configKey: RETENTION_CONFIG_KEY },
    {
      $set: { retentionSettings: settings },
      $setOnInsert: { configKey: RETENTION_CONFIG_KEY },
    },
    { new: true, upsert: true, runValidators: true }
  )
    .select('retentionSettings retentionLastReport')
    .lean<RetentionRecord>();
  return serializeConfiguration(record);
}

function cutoff(now: Date, ageDays: number, ageOverrideMs?: number) {
  return new Date(now.getTime() - (ageOverrideMs ?? ageDays * 24 * 60 * 60 * 1000));
}

async function planVoiceNoteRetention({
  filter,
  reason,
  session,
}: {
  filter: Record<string, unknown>;
  reason: string;
  session: ClientSession;
}): Promise<VoiceRetentionPlan> {
  const notes = await VoiceNote.find(filter)
    .select('_id senderId projectId blobUrl fileSize')
    .sort({ createdAt: 1, _id: 1 })
    .limit(RETENTION_BATCH_LIMIT)
    .session(session)
    .lean();
  const validNotes = notes.filter((note) => Boolean(normalizeStorageKey(note.blobUrl)));
  const targets = collectStorageDeletionTargets(
    validNotes.map((note) => ({ key: note.blobUrl, bytes: note.fileSize }))
  );
  const sharedKeys = await findSharedStorageKeys({
    keys: targets.map((target) => target.key),
    excludedVoiceNoteIds: validNotes.map((note) => note._id),
    session,
  });

  return {
    noteIds: validNotes.map((note) => note._id),
    slots: validNotes.map((note) => ({
      ownerId: String(note.senderId),
      projectId: String(note.projectId),
    })),
    targets: targets
      .filter((target) => !sharedKeys.has(target.key))
      .map((target) => ({ ...target, reason })),
    skippedInvalidObjects: notes.length - validNotes.length,
    protectedSharedObjects: [...sharedKeys].length,
  };
}

async function planBroadcastRetention({
  olderThan,
  session,
}: {
  olderThan: Date;
  session: ClientSession;
}): Promise<BroadcastRetentionPlan> {
  const broadcasts = await User.find({
    role: 'supervisor',
    broadcastType: 'audio',
    broadcastContent: { $ne: null },
    broadcastCreatedAt: { $lte: olderThan },
  })
    .select('_id broadcastContent broadcastSize')
    .sort({ broadcastCreatedAt: 1, _id: 1 })
    .limit(RETENTION_BATCH_LIMIT)
    .session(session)
    .lean();
  const validBroadcasts = broadcasts.filter((broadcast) => Boolean(normalizeStorageKey(broadcast.broadcastContent)));
  const targets = collectStorageDeletionTargets(
    validBroadcasts.map((broadcast) => ({ key: broadcast.broadcastContent, bytes: broadcast.broadcastSize }))
  );
  const sharedKeys = await findSharedStorageKeys({
    keys: targets.map((target) => target.key),
    excludedSupervisorIds: validBroadcasts.map((broadcast) => broadcast._id),
    session,
  });

  return {
    supervisorIds: validBroadcasts.map((broadcast) => broadcast._id),
    targets: targets
      .filter((target) => !sharedKeys.has(target.key))
      .map((target) => ({ ...target, reason: 'broadcast-retention' })),
    skippedInvalidObjects: broadcasts.length - validBroadcasts.length,
    protectedSharedObjects: [...sharedKeys].length,
  };
}

async function planUnusedPdfRetention({
  olderThan,
  session,
}: {
  olderThan: Date;
  session: ClientSession;
}): Promise<PdfRetentionPlan> {
  const reservations = await UploadReservation.find({
    kind: 'pdf',
    state: 'finalized',
    retentionCleanupQueuedAt: null,
    updatedAt: { $lte: olderThan },
  })
    .select('_id key actualBytes')
    .sort({ updatedAt: 1, _id: 1 })
    .limit(RETENTION_BATCH_LIMIT)
    .session(session)
    .lean();
  const validReservations = reservations.filter((reservation) => Boolean(normalizeStorageKey(reservation.key)));
  const targets = collectStorageDeletionTargets(
    validReservations.map((reservation) => ({ key: reservation.key, bytes: reservation.actualBytes }))
  );
  const sharedKeys = await findSharedStorageKeys({
    keys: targets.map((target) => target.key),
    session,
  });
  const queuedKeys = new Set(targets.filter((target) => !sharedKeys.has(target.key)).map((target) => target.key));

  return {
    reservationIds: validReservations
      .filter((reservation) => queuedKeys.has(normalizeStorageKey(reservation.key) || ''))
      .map((reservation) => reservation._id),
    targets: targets
      .filter((target) => !sharedKeys.has(target.key))
      .map((target) => ({ ...target, reason: 'unused-pdf-retention' })),
    skippedInvalidObjects: reservations.length - validReservations.length,
    protectedSharedObjects: [...sharedKeys].length,
  };
}

async function buildRetentionPlan(
  settings: RetentionSettings,
  now: Date,
  session: ClientSession,
  ageOverrides: RetentionAgeOverrides = {}
): Promise<RetentionPlan> {
  const playedVoiceNotes = settings.playedVoiceNotes.enabled
    ? await planVoiceNoteRetention({
      filter: {
        isPlayed: true,
        playedAt: { $lte: cutoff(now, settings.playedVoiceNotes.ageDays, ageOverrides.playedVoiceNotes) },
      },
      reason: 'played-voice-retention',
      session,
    })
    : emptyVoicePlan();
  const unplayedVoiceNotes = settings.unplayedVoiceNotes.enabled
    ? await planVoiceNoteRetention({
      filter: {
        isPlayed: { $ne: true },
        createdAt: { $lte: cutoff(now, settings.unplayedVoiceNotes.ageDays, ageOverrides.unplayedVoiceNotes) },
      },
      reason: 'unplayed-voice-retention',
      session,
    })
    : emptyVoicePlan();
  const audioBroadcasts = settings.audioBroadcasts.enabled
    ? await planBroadcastRetention({
      olderThan: cutoff(now, settings.audioBroadcasts.ageDays, ageOverrides.audioBroadcasts),
      session,
    })
    : emptyBroadcastPlan();
  const unusedPdfUploads = settings.unusedPdfUploads.enabled
    ? await planUnusedPdfRetention({
      olderThan: cutoff(now, settings.unusedPdfUploads.ageDays, ageOverrides.unusedPdfUploads),
      session,
    })
    : emptyPdfPlan();

  return { playedVoiceNotes, unplayedVoiceNotes, audioBroadcasts, unusedPdfUploads };
}

function reportForPlan(plan: RetentionPlan, status: RetentionExecutionReport['status'], scheduledFor: string | null) {
  const targets = [
    ...plan.playedVoiceNotes.targets,
    ...plan.unplayedVoiceNotes.targets,
    ...plan.audioBroadcasts.targets,
    ...plan.unusedPdfUploads.targets,
  ];
  return {
    ...emptyReport(status, scheduledFor),
    playedVoiceNotesDeleted: plan.playedVoiceNotes.noteIds.length,
    unplayedVoiceNotesDeleted: plan.unplayedVoiceNotes.noteIds.length,
    audioBroadcastsCleared: plan.audioBroadcasts.supervisorIds.length,
    unusedPdfUploadsQueued: plan.unusedPdfUploads.reservationIds.length,
    queuedObjects: targets.length,
    queuedDeletionBytes: targets.reduce((total, target) => total + target.bytes, 0),
    protectedSharedObjects:
      plan.playedVoiceNotes.protectedSharedObjects
      + plan.unplayedVoiceNotes.protectedSharedObjects
      + plan.audioBroadcasts.protectedSharedObjects
      + plan.unusedPdfUploads.protectedSharedObjects,
    skippedInvalidObjects:
      plan.playedVoiceNotes.skippedInvalidObjects
      + plan.unplayedVoiceNotes.skippedInvalidObjects
      + plan.audioBroadcasts.skippedInvalidObjects
      + plan.unusedPdfUploads.skippedInvalidObjects,
  };
}

async function executeRetentionPlan(plan: RetentionPlan, session: ClientSession) {
  await assertStorageLedgerReady(session);
  const targets = [
    ...plan.playedVoiceNotes.targets,
    ...plan.unplayedVoiceNotes.targets,
    ...plan.audioBroadcasts.targets,
    ...plan.unusedPdfUploads.targets,
  ];
  for (const target of targets) await enqueueStorageDeletion(target, session);

  for (const planPart of [plan.playedVoiceNotes, plan.unplayedVoiceNotes]) {
    if (planPart.noteIds.length === 0) continue;
    await VoiceNote.deleteMany({ _id: { $in: planPart.noteIds } }).session(session);
    for (const slot of planPart.slots) {
      await releaseVoiceNoteSlot(slot.ownerId, slot.projectId, session);
    }
  }

  if (plan.audioBroadcasts.supervisorIds.length > 0) {
    await User.updateMany(
      { _id: { $in: plan.audioBroadcasts.supervisorIds }, role: 'supervisor', broadcastType: 'audio' },
      {
        $set: {
          broadcastType: null,
          broadcastContent: null,
          broadcastSize: 0,
          broadcastCreatedAt: null,
        },
      },
      { session }
    );
  }

  if (plan.unusedPdfUploads.reservationIds.length > 0) {
    await UploadReservation.updateMany(
      { _id: { $in: plan.unusedPdfUploads.reservationIds }, state: 'finalized' },
      { $set: { retentionCleanupQueuedAt: new Date() } },
      { session }
    );
  }
}

async function processRetentionSettings(
  settings: RetentionSettings,
  now = new Date(),
  ageOverrides: RetentionAgeOverrides = {}
) {
  return withStorageTransaction(async (session) => {
    const plan = await buildRetentionPlan(settings, now, session, ageOverrides);
    await executeRetentionPlan(plan, session);
    return reportForPlan(plan, 'completed', null);
  });
}

export async function getRetentionPreview(settings: RetentionSettings): Promise<RetentionPreview> {
  await connectToDatabase();
  const plan = await withStorageTransaction((session) => buildRetentionPlan(settings, new Date(), session));
  const report = reportForPlan(plan, 'completed', null);
  return {
    playedVoiceNotesDeleted: report.playedVoiceNotesDeleted,
    unplayedVoiceNotesDeleted: report.unplayedVoiceNotesDeleted,
    audioBroadcastsCleared: report.audioBroadcastsCleared,
    unusedPdfUploadsQueued: report.unusedPdfUploadsQueued,
    queuedObjects: report.queuedObjects,
    queuedDeletionBytes: report.queuedDeletionBytes,
    protectedSharedObjects: report.protectedSharedObjects,
    skippedInvalidObjects: report.skippedInvalidObjects,
    limitedToBatch: true,
  };
}

export async function processConfiguredRetention() {
  const configuration = await getRetentionConfiguration();
  if (!configuration.configured) return emptyReport('not-configured', null);
  if (!configuration.settings.schedule.enabled) return emptyReport('disabled', null);

  const now = new Date();
  const scheduledFor = getRetentionScheduleKey(configuration.settings, now);
  if (!scheduledFor) return emptyReport('not-due', null);

  const lockToken = randomUUID();
  const claimed = await SystemConfig.findOneAndUpdate(
    {
      configKey: RETENTION_CONFIG_KEY,
      retentionLastScheduledFor: { $ne: scheduledFor },
      retentionNextAttemptAt: { $not: { $gt: now } },
      $or: [
        { retentionRunLockedUntil: null },
        { retentionRunLockedUntil: { $exists: false } },
        { retentionRunLockedUntil: { $lte: now } },
      ],
    },
    {
      $set: {
        retentionRunToken: lockToken,
        retentionRunLockedUntil: new Date(now.getTime() + RETENTION_LEASE_MS),
      },
    },
    { new: true }
  );
  if (!claimed) return emptyReport('running', scheduledFor);

  try {
    const report = await processRetentionSettings(configuration.settings, now);
    report.scheduledFor = scheduledFor;
    const completedAt = new Date();
    report.completedAt = completedAt.toISOString();
    await SystemConfig.updateOne(
      { configKey: RETENTION_CONFIG_KEY, retentionRunToken: lockToken },
      {
        $set: {
          retentionLastScheduledFor: scheduledFor,
          retentionLastReport: report,
          retentionLastRunAt: completedAt,
          retentionRunLockedUntil: null,
          retentionRunToken: null,
          retentionNextAttemptAt: null,
        },
      }
    );
    return report;
  } catch {
    const report = emptyReport('failed', scheduledFor);
    await SystemConfig.updateOne(
      { configKey: RETENTION_CONFIG_KEY, retentionRunToken: lockToken },
      {
        $set: {
          retentionLastReport: report,
          retentionRunLockedUntil: null,
          retentionRunToken: null,
          retentionNextAttemptAt: new Date(Date.now() + RETENTION_RETRY_DELAY_MS),
        },
      }
    );
    throw new Error('Configured retention failed.');
  }
}

export async function processLegacyContentRetention() {
  return processRetentionSettings(
    {
      schedule: { enabled: true, timezone: 'UTC', time: '00:00' },
      playedVoiceNotes: { enabled: true, ageDays: 1 },
      unplayedVoiceNotes: { enabled: true, ageDays: 1 },
      audioBroadcasts: { enabled: true, ageDays: 3 },
      unusedPdfUploads: { enabled: false, ageDays: 7 },
    },
    new Date(),
    { playedVoiceNotes: 10 * 60 * 1000 }
  );
}
