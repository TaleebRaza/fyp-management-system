import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import mongoose, { ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';

import StorageDeletionOutbox from '../models/StorageDeletionOutbox';
import SystemConfig from '../models/SystemConfig';
import UploadReservation from '../models/UploadReservation';
import VoiceNote from '../models/VoiceNote';
import VoiceNoteQuota from '../models/VoiceNoteQuota';
import { APP_SETTINGS } from '../config/appSettings';
import { BUCKET_NAME, getS3Client, MAX_STORAGE_BYTES } from './s3-client';
import {
  getStorageObjectKind,
  hasExpectedStorageMagic,
  normalizeStorageKey,
  type StorageUploadKind,
} from './storageValidation';

const MAX_DELETION_ATTEMPTS = 8;
const MAX_DELETION_BATCH_SIZE = 100;
const DELETION_WORKER_LEASE_MS = 5 * 60 * 1000;

export class StorageProtocolError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'StorageProtocolError';
  }
}

type ReserveUploadInput = {
  key: string;
  ownerId: string;
  kind: StorageUploadKind;
  projectId?: string;
  expectedBytes: number;
  expectedContentType: string;
  idempotencyKey: string;
  expiresAt: Date;
};

type FinalizeUploadInput<T> = {
  key: string;
  ownerId: string;
  kind: StorageUploadKind;
  projectId?: string;
  commit: (
    session: ClientSession,
    uploadedObject: { actualBytes: number; actualContentType: string }
  ) => Promise<T>;
};

type FinalizedUpload<T> =
  | { finalizedNow: false }
  | { finalizedNow: true; result: T };

export async function withStorageTransaction<T>(operation: (session: ClientSession) => Promise<T>) {
  const session = await mongoose.startSession();

  try {
    let value!: T;
    await session.withTransaction(async () => {
      value = await operation(session);
    });

    return value;
  } finally {
    await session.endSession();
  }
}

export async function assertStorageLedgerReady(session: ClientSession) {
  const configs = await SystemConfig.find({ configKey: 'storage' })
    .select('usedBytes reservedBytes')
    .limit(2)
    .session(session)
    .lean();
  const config = configs[0];
  if (
    configs.length !== 1
    || !config
    || !Number.isSafeInteger(config.usedBytes)
    || config.usedBytes < 0
    || !Number.isSafeInteger(config.reservedBytes)
    || config.reservedBytes < 0
  ) {
    throw new StorageProtocolError(
      'Storage ledger is not initialized. Run the storage integrity audit before using uploads.',
      503
    );
  }
}

function assertReservationInput(input: ReserveUploadInput) {
  const expectedObjectKind = input.kind === 'pdf' ? 'proposal' : input.kind;
  if (
    !input.key
    || normalizeStorageKey(input.key) !== input.key
    || getStorageObjectKind(input.key) !== expectedObjectKind
    || !input.ownerId
    || !input.idempotencyKey
    || input.idempotencyKey.length > 128
  ) {
    throw new StorageProtocolError('Invalid upload reservation.', 400);
  }
  if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0) {
    throw new StorageProtocolError('A valid upload size is required.', 400);
  }
}

function isSameReservation(existing: {
  key: unknown;
  kind: unknown;
  projectId?: unknown;
  expectedBytes: unknown;
  expectedContentType: unknown;
}, input: ReserveUploadInput) {
  return String(existing.key) === input.key
    && String(existing.kind) === input.kind
    && String(existing.projectId || '') === String(input.projectId || '')
    && Number(existing.expectedBytes) === input.expectedBytes
    && String(existing.expectedContentType) === input.expectedContentType;
}

async function reserveVoiceNoteSlot(input: ReserveUploadInput, session: ClientSession) {
  if (!input.projectId) throw new StorageProtocolError('Voice-note uploads require a project.', 400);

  const existingNoteCount = await VoiceNote.countDocuments({
    projectId: input.projectId,
    senderId: input.ownerId,
  }).session(session);
  await VoiceNoteQuota.updateOne(
    { ownerId: input.ownerId, projectId: input.projectId },
    { $setOnInsert: { count: existingNoteCount } },
    { upsert: true, session }
  );
  const claimed = await VoiceNoteQuota.updateOne(
    {
      ownerId: input.ownerId,
      projectId: input.projectId,
      count: { $lt: APP_SETTINGS.MAX_VOICE_NOTES_PER_SENDER },
    },
    { $inc: { count: 1 } },
    { session }
  );
  if (claimed.modifiedCount !== 1) {
    throw new StorageProtocolError(
      `You can keep a maximum of ${APP_SETTINGS.MAX_VOICE_NOTES_PER_SENDER} voice notes per project. Delete one to record another.`,
      409
    );
  }
}

export async function releaseVoiceNoteSlot(
  ownerId: string,
  projectId: string,
  session: ClientSession
) {
  await VoiceNoteQuota.updateOne(
    { ownerId, projectId, count: { $gt: 0 } },
    { $inc: { count: -1 } },
    { session }
  );
}

export async function reserveUpload(input: ReserveUploadInput) {
  assertReservationInput(input);

  return await withStorageTransaction(async (session) => {
    await assertStorageLedgerReady(session);
    const existing = await UploadReservation.findOne({
      ownerId: input.ownerId,
      idempotencyKey: input.idempotencyKey,
    }).session(session);
    if (existing) {
      if (!isSameReservation(existing, input)) {
        throw new StorageProtocolError('Upload idempotency key was reused with different data.', 409);
      }
      return existing;
    }

    if (input.kind === 'voice') await reserveVoiceNoteSlot(input, session);

    const capacity = await SystemConfig.updateOne(
      {
        configKey: 'storage',
        $expr: {
          $lte: [
            {
              $add: [
                { $ifNull: ['$usedBytes', 0] },
                { $ifNull: ['$reservedBytes', 0] },
                input.expectedBytes,
              ],
            },
            MAX_STORAGE_BYTES,
          ],
        },
      },
      { $inc: { reservedBytes: input.expectedBytes } },
      { session }
    );
    if (capacity.modifiedCount !== 1) {
      throw new StorageProtocolError('System storage capacity reached.', 403);
    }

    const reservation = new UploadReservation(input);
    await reservation.save({ session });
    return reservation;
  });
}

export async function enqueueStorageDeletion(
  target: { key: string; bytes: number; reservedBytes?: number; reason: string },
  session: ClientSession
) {
  const reservedBytes = target.reservedBytes ?? 0;
  if (
    !target.key
    || normalizeStorageKey(target.key) !== target.key
    || !Number.isSafeInteger(target.bytes)
    || target.bytes < 0
    || !Number.isSafeInteger(reservedBytes)
    || reservedBytes < 0
  ) {
    throw new StorageProtocolError('Invalid storage deletion target.', 400);
  }

  await StorageDeletionOutbox.findOneAndUpdate(
    { key: target.key },
    {
      $max: { bytes: target.bytes, reservedBytes },
      $setOnInsert: {
        reason: target.reason.slice(0, 100),
        verifiedBytes: null,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        lockedUntil: null,
        lockToken: null,
        lastErrorCode: '',
        deadLetteredAt: null,
      },
    },
    { upsert: true, session }
  );
}

export async function cancelUploadReservation(
  key: string,
  ownerId: string,
  reason: string
) {
  return await withStorageTransaction(async (session) => {
    await assertStorageLedgerReady(session);
    const reservation = await UploadReservation.findOne({ key, ownerId }).session(session);
    if (!reservation || reservation.state !== 'pending') return false;

    if (reservation.kind === 'voice' && reservation.projectId) {
      await releaseVoiceNoteSlot(String(reservation.ownerId), String(reservation.projectId), session);
    }

    await enqueueStorageDeletion(
      {
        key: reservation.key,
        bytes: 0,
        reservedBytes: reservation.expectedBytes,
        reason,
      },
      session
    );

    reservation.state = 'cancelled';
    await reservation.save({ session });
    return true;
  });
}

async function verifyUploadObject(reservation: {
  key: string;
  kind: StorageUploadKind;
  expectedBytes: number;
  expectedContentType: string;
}) {
  const object = await getS3Client().send(
    new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: reservation.key })
  );
  const actualBytes = Number(object.ContentLength || 0);
  const actualContentType = String(object.ContentType || '').split(';', 1)[0];
  if (
    actualBytes <= 0
    || actualBytes > reservation.expectedBytes
    || actualContentType !== reservation.expectedContentType
  ) {
    throw new StorageProtocolError('Uploaded object does not match its reservation.', 400);
  }

  const prefix = await getS3Client().send(
    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: reservation.key, Range: 'bytes=0-7' })
  );
  const bytes = prefix.Body ? await prefix.Body.transformToByteArray() : new Uint8Array();
  if (!hasExpectedStorageMagic(reservation.kind, bytes)) {
    throw new StorageProtocolError('Uploaded object has an invalid file signature.', 400);
  }

  return { actualBytes, actualContentType };
}

export async function finalizeUploadReservation<T>(input: FinalizeUploadInput<T>) {
  const reservation = await UploadReservation.findOne({
    key: input.key,
    ownerId: input.ownerId,
    kind: input.kind,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  }).select('key ownerId kind expectedBytes expectedContentType state expiresAt');
  if (!reservation) throw new StorageProtocolError('Upload reservation not found.', 404);
  if (reservation.state === 'finalized') return { finalizedNow: false } satisfies FinalizedUpload<T>;
  if (reservation.state !== 'pending') throw new StorageProtocolError('Upload reservation is no longer active.', 409);
  if (reservation.expiresAt.getTime() <= Date.now()) {
    await cancelUploadReservation(input.key, input.ownerId, 'expired-upload');
    throw new StorageProtocolError('Upload reservation has expired. Upload the file again.', 409);
  }

  let verified: { actualBytes: number; actualContentType: string };
  try {
    verified = await verifyUploadObject({
      key: reservation.key,
      kind: reservation.kind,
      expectedBytes: reservation.expectedBytes,
      expectedContentType: reservation.expectedContentType,
    });
  } catch (error) {
    await cancelUploadReservation(input.key, input.ownerId, 'invalid-upload');
    throw error;
  }

  return await withStorageTransaction(async (session) => {
    await assertStorageLedgerReady(session);
    const activeReservation = await UploadReservation.findOne({
      _id: reservation._id,
      state: 'pending',
      expiresAt: { $gt: new Date() },
    }).session(session);
    if (!activeReservation) return { finalizedNow: false } satisfies FinalizedUpload<T>;

    const result = await input.commit(session, verified);
    const converted = await SystemConfig.updateOne(
      { configKey: 'storage', reservedBytes: { $gte: activeReservation.expectedBytes } },
      {
        $inc: {
          reservedBytes: -activeReservation.expectedBytes,
          usedBytes: verified.actualBytes,
        },
      },
      { session }
    );
    if (converted.modifiedCount !== 1) throw new Error('Storage reservation ledger is inconsistent.');

    activeReservation.actualBytes = verified.actualBytes;
    activeReservation.actualContentType = verified.actualContentType;
    activeReservation.state = 'finalized';
    await activeReservation.save({ session });

    return { finalizedNow: true, result };
  });
}

function retryDelay(attempts: number) {
  return Math.min(6 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(attempts, 8)));
}

function isMissingStorageObject(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const storageError = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return storageError.name === 'NotFound'
    || storageError.name === 'NoSuchKey'
    || storageError.$metadata?.httpStatusCode === 404;
}

async function getDeletionBytes(target: {
  _id: unknown;
  key: string;
  bytes: number;
  reservedBytes?: number | null;
  verifiedBytes?: number | null;
  lockToken?: string | null;
}) {
  if (normalizeStorageKey(target.key) !== target.key) {
    throw new Error('Storage deletion target has an invalid object key.');
  }
  // Reservation cancellations were never added to usedBytes. Their quota is
  // released separately after deletion, so subtracting object bytes here would
  // undercount live data. The reservation lookup also protects legacy outbox
  // rows created before reservedBytes was recorded on the deletion target.
  const unfinalizedReservation = await UploadReservation.exists({
    key: target.key,
    state: { $in: ['pending', 'cancelled'] },
  });
  if (Number(target.reservedBytes || 0) > 0 || unfinalizedReservation) return 0;

  if (Number.isSafeInteger(target.verifiedBytes) && Number(target.verifiedBytes) >= 0) {
    return Number(target.verifiedBytes);
  }

  let verifiedBytes = 0;
  try {
    const object = await getS3Client().send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: target.key })
    );
    verifiedBytes = Number(object.ContentLength);
    if (!Number.isSafeInteger(verifiedBytes) || verifiedBytes < 0) {
      throw new Error('Storage object returned an invalid size.');
    }
  } catch (error) {
    if (!isMissingStorageObject(error)) throw error;
  }

  const saved = await StorageDeletionOutbox.updateOne(
    { _id: target._id, state: 'processing', lockToken: target.lockToken },
    { $set: { verifiedBytes } }
  );
  if (saved.modifiedCount !== 1) throw new Error('Storage deletion lease was lost.');
  return verifiedBytes;
}

export async function processStorageDeletionOutbox(limit = 25) {
  await withStorageTransaction(async (session) => {
    await assertStorageLedgerReady(session);
    const duplicateKeys = await StorageDeletionOutbox.aggregate([
      { $group: { _id: '$key', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).session(session);
    if (duplicateKeys.length > 0) {
      throw new StorageProtocolError(
        'Duplicate storage deletion targets exist. Run the storage integrity audit before cleanup.',
        503
      );
    }
    return true;
  });
  const batchSize = Math.min(Math.max(Math.trunc(limit), 1), MAX_DELETION_BATCH_SIZE);
  let claimed = 0;
  let deleted = 0;
  let retried = 0;
  let deadLettered = 0;
  let maxJobLagMs = 0;

  for (let index = 0; index < batchSize; index += 1) {
    const now = new Date();
    const lockToken = randomUUID();
    const target = await StorageDeletionOutbox.findOneAndUpdate(
      {
        $or: [
          { state: 'pending', nextAttemptAt: { $lte: now } },
          { state: 'processing', lockedUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          state: 'processing',
          lockedUntil: new Date(now.getTime() + DELETION_WORKER_LEASE_MS),
          lockToken,
        },
        $inc: { attempts: 1 },
      },
      { new: true, sort: { nextAttemptAt: 1, _id: 1 } }
    ).lean();
    if (!target) break;

    claimed += 1;
    maxJobLagMs = Math.max(maxJobLagMs, Math.max(now.getTime() - target.nextAttemptAt.getTime(), 0));

    try {
      const deletionBytes = await getDeletionBytes(target);
      await getS3Client().send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: target.key }));
      await withStorageTransaction(async (session) => {
        const activeTarget = await StorageDeletionOutbox.findOne({
          _id: target._id,
          state: 'processing',
          lockToken,
        }).session(session);
        if (!activeTarget) return;

        await assertStorageLedgerReady(session);
        await SystemConfig.updateOne(
          { configKey: 'storage' },
          [
            {
              $set: {
                usedBytes: {
                  $max: [0, { $subtract: [{ $ifNull: ['$usedBytes', 0] }, deletionBytes] }],
                },
                reservedBytes: {
                  $max: [
                    0,
                    {
                      $subtract: [
                        { $ifNull: ['$reservedBytes', 0] },
                        Number(activeTarget.reservedBytes || 0),
                      ],
                    },
                  ],
                },
              },
            },
          ],
          { session }
        );
        await StorageDeletionOutbox.deleteOne({ _id: activeTarget._id }).session(session);
      });
      deleted += 1;
    } catch (error) {
      const isDeadLetter = target.attempts >= MAX_DELETION_ATTEMPTS;
      await StorageDeletionOutbox.updateOne(
        { _id: target._id, state: 'processing', lockToken },
        {
          $set: {
            state: isDeadLetter ? 'dead-letter' : 'pending',
            nextAttemptAt: new Date(Date.now() + retryDelay(target.attempts)),
            lockedUntil: null,
            lockToken: null,
            lastErrorCode: error instanceof Error && error.name === 'TimeoutError'
              ? 'storage_delete_timeout'
              : 'storage_delete_failed',
            deadLetteredAt: isDeadLetter ? new Date() : null,
          },
        }
      );
      if (isDeadLetter) {
        deadLettered += 1;
      } else {
        retried += 1;
      }
    }
  }

  const oldestDeadLetter = await StorageDeletionOutbox.findOne({ state: 'dead-letter' })
    .select('deadLetteredAt updatedAt')
    .sort({ deadLetteredAt: 1, _id: 1 })
    .lean();
  const oldestDeadLetterAt = oldestDeadLetter?.deadLetteredAt || oldestDeadLetter?.updatedAt;

  return {
    claimed,
    deleted,
    retried,
    deadLettered,
    maxJobLagMs,
    oldestDeadLetterAgeMs: oldestDeadLetterAt
      ? Math.max(Date.now() - oldestDeadLetterAt.getTime(), 0)
      : 0,
  };
}

export async function expireUploadReservations(limit = 25) {
  const reservations = await UploadReservation.find({
    state: 'pending',
    expiresAt: { $lte: new Date() },
  })
    .sort({ expiresAt: 1, _id: 1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .select('key ownerId')
    .lean();

  let cancelled = 0;
  for (const reservation of reservations) {
    if (await cancelUploadReservation(reservation.key, String(reservation.ownerId), 'expired-upload')) {
      cancelled += 1;
    }
  }

  return { processed: reservations.length, cancelled };
}
