import mongoose, { type ClientSession } from 'mongoose';

import Project from '../models/Project';
import User from '../models/User';
import VivaAuditEvent from '../models/VivaAuditEvent';
import VivaPanel from '../models/VivaPanel';
import VivaParticipantLock from '../models/VivaParticipantLock';
import VivaRound from '../models/VivaRound';
import VivaSession from '../models/VivaSession';
import { calculateVivaPhase, isVivaPanelAdmin, type VivaPhase } from './viva';
import { recordVivaAuditEvent, withVivaTransaction } from './vivaPersistence';

export type VivaScheduleDto = {
  id: string;
  roundId: string;
  panelId: string;
  projectId: string;
  scheduledAt: string;
  vivaEndsAt: string;
  locationLabel: string;
  version: number;
  phase: VivaPhase;
  cancellationReason: string;
};

export type VivaStudentSessionDto = VivaScheduleDto & {
  roundName: string;
  panel: {
    id: string;
    admin: { id: string; name: string; rollNo: string };
    members: Array<{ id: string; name: string; rollNo: string }>;
  };
};

export type VivaScheduleInput = {
  roundId: string;
  panelId: string;
  projectId: string;
  scheduledAt: Date;
  locationLabel: string;
};

export type VivaScheduleActor = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaSessionCancellationInput = {
  sessionId: string;
  version: number;
  cancellationReason: string;
};

export type VivaPanelSwapInput = {
  first: { sessionId: string; version: number };
  second: { sessionId: string; version: number };
};

export type VivaPanelSwapResult =
  | { success: true; schedules: [VivaScheduleDto, VivaScheduleDto] }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'not-swappable' | 'concurrent-change';
      error: string;
    };

export type VivaScheduleAvailabilityInput = {
  startsAt: Date;
  endsAt: Date;
  locationLabel: string;
};

export type VivaAutomaticScheduleInput = {
  roundId: string;
  availability: VivaScheduleAvailabilityInput[];
};

export type VivaAutomaticScheduleDraft = {
  projectId: string;
  panelId: string;
  scheduledAt: string;
  vivaEndsAt: string;
  locationLabel: string;
};

export type VivaAutomaticSchedulePreview = {
  panelRooms: Array<{ panelId: string; locationLabel: string }>;
  scheduled: VivaAutomaticScheduleDraft[];
  unplaced: Array<{ projectId: string; reason: string }>;
};

export type VivaAutomaticScheduleSaveInput = {
  roundId: string;
  panelRooms: Array<{ panelId: string; locationLabel: string }>;
  schedules: VivaScheduleInput[];
};

export type VivaScheduleSaveResult =
  | { success: true; schedule: VivaScheduleDto }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'not-reschedulable' | 'concurrent-change';
      error: string;
    };

export type VivaSessionCancellationResult =
  | { success: true; schedule: VivaScheduleDto }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'not-cancellable' | 'concurrent-change';
      error: string;
    };

export type VivaAutomaticSchedulePreviewResult =
  | { success: true; draft: VivaAutomaticSchedulePreview }
  | { success: false; reason: 'invalid' | 'not-found'; error: string };

export type VivaAutomaticScheduleSaveResult =
  | { success: true; schedules: VivaScheduleDto[] }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'concurrent-change';
      error: string;
    };

type VivaRoundRecord = {
  _id: unknown;
  projectIds?: unknown;
  targetPanelSize?: unknown;
  minimumPanelSize?: unknown;
  vivaDurationMinutes?: unknown;
  scheduleRevision?: unknown;
  confirmedAt?: Date | null;
};

type VivaPanelRecord = {
  _id: unknown;
  roundId?: unknown;
  examinerIds?: unknown;
  panelAdminId?: unknown;
  locationLabel?: unknown;
};

type ProjectRecord = {
  _id: unknown;
  supervisorId?: unknown;
  members?: unknown;
};

type UserRecord = { _id: unknown; role?: unknown; name?: unknown; rollNo?: unknown };

type VivaSessionRecord = {
  _id: unknown;
  roundId?: unknown;
  panelId?: unknown;
  projectId?: unknown;
  scheduledAt?: Date | null;
  vivaEndsAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: unknown;
  locationLabel?: unknown;
  version?: unknown;
};

type ScheduleContext = {
  round: VivaRoundRecord;
  panel: VivaPanelRecord;
  project: ProjectRecord;
  panelExaminerIds: string[];
  projectMemberIds: string[];
  vivaEndsAt: Date;
};

type ScheduleReservation = {
  scheduledAt: Date;
  vivaEndsAt: Date;
  panelExaminerIds: string[];
  projectMemberIds: string[];
};

type AutomaticSchedulePanel = {
  id: string;
  examinerIds: string[];
  locationLabel: string;
};

type AutomaticScheduleProject = {
  id: string;
  memberIds: string[];
};

type AutomaticScheduleSlot = {
  id: number;
  scheduledAt: Date;
  vivaEndsAt: Date;
};

type AutomaticScheduleOption = {
  panel: AutomaticSchedulePanel;
  slot: AutomaticScheduleSlot;
};

type AutomaticScheduleOccupancy = {
  blockedSlotsByTeacher: Map<string, Uint32Array>;
  blockedSlotsByStudent: Map<string, Uint32Array>;
  overlappingSlotIds: number[][];
  orderedSlotIds: number[];
  validSlotBits: Uint32Array;
};

const MAX_AUTOMATIC_SCHEDULE_AVAILABILITY_WINDOWS = 32;
const MAX_AUTOMATIC_SCHEDULE_SLOTS = 1_000;
const MAX_AUTOMATIC_SCHEDULE_ENTRIES = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asObjectId(value: unknown): string | null {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) ? value : null;
}

function asVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function asLocationLabel(value: unknown): string | null {
  if (value === undefined) return '';
  if (typeof value !== 'string') return null;

  const label = value.trim();
  return label.length <= 160 ? label : null;
}

function roomKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function asCancellationReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const reason = value.trim();
  return reason.length > 0 && reason.length <= 1_000 ? reason : null;
}

function asScheduledAt(value: unknown): Date | null {
  if (
    typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    return null;
  }

  const scheduledAt = new Date(value);
  return Number.isFinite(scheduledAt.getTime()) ? scheduledAt : null;
}

function asIdList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function hasOverlap(first: readonly string[], second: readonly string[]): boolean {
  const firstIds = new Set(first);
  return second.some((id) => firstIds.has(id));
}

function toIsoString(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function toScheduleDto(session: VivaSessionRecord): VivaScheduleDto | null {
  const scheduledAt = toIsoString(session.scheduledAt);
  const vivaEndsAt = toIsoString(session.vivaEndsAt);
  const version = asVersion(session.version);
  if (!scheduledAt || !vivaEndsAt || version === null) return null;

  return {
    id: String(session._id),
    roundId: String(session.roundId),
    panelId: String(session.panelId),
    projectId: String(session.projectId),
    scheduledAt,
    vivaEndsAt,
    locationLabel: typeof session.locationLabel === 'string' ? session.locationLabel : '',
    version,
    phase: calculateVivaPhase({
      startedAt: session.startedAt instanceof Date ? session.startedAt : null,
      completedAt: session.completedAt instanceof Date ? session.completedAt : null,
      cancelledAt: session.cancelledAt instanceof Date ? session.cancelledAt : null,
    }),
    cancellationReason: typeof session.cancellationReason === 'string' ? session.cancellationReason : '',
  };
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11_000;
}

function isTerminal(session: VivaSessionRecord): boolean {
  return Boolean(session.startedAt || session.completedAt || session.cancelledAt);
}

export function parseVivaScheduleInput(value: unknown):
  | { success: true; input: VivaScheduleInput }
  | { success: false; error: string } {
  if (!isRecord(value)) return { success: false, error: 'Invalid Viva schedule details.' };

  const roundId = asObjectId(value.roundId);
  const panelId = asObjectId(value.panelId);
  const projectId = asObjectId(value.projectId);
  const scheduledAt = asScheduledAt(value.scheduledAt);
  const locationLabel = asLocationLabel(value.locationLabel);
  if (!roundId || !panelId || !projectId || !scheduledAt || !locationLabel) {
    return { success: false, error: 'Choose a valid team, panel, date, time, and location.' };
  }

  return { success: true, input: { roundId, panelId, projectId, scheduledAt, locationLabel } };
}

export function parseVivaAutomaticScheduleInput(value: unknown):
  | { success: true; input: VivaAutomaticScheduleInput }
  | { success: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value.availability)) {
    return { success: false, error: 'Provide at least one Viva availability window.' };
  }

  const roundId = asObjectId(value.roundId);
  if (!roundId) return { success: false, error: 'Choose a valid Viva round.' };
  if (value.availability.length === 0 || value.availability.length > MAX_AUTOMATIC_SCHEDULE_AVAILABILITY_WINDOWS) {
    return { success: false, error: 'Provide between 1 and 32 Viva availability windows.' };
  }

  const availability = value.availability.flatMap((window) => {
    if (!isRecord(window)) return [];

    const startsAt = asScheduledAt(window.startsAt);
    const endsAt = asScheduledAt(window.endsAt);
    const locationLabel = asLocationLabel(window.locationLabel);
    return startsAt && endsAt && startsAt < endsAt && locationLabel
      ? [{ startsAt, endsAt, locationLabel }]
      : [];
  }).sort((first, second) => first.startsAt.getTime() - second.startsAt.getTime());
  if (availability.length !== value.availability.length) {
    return { success: false, error: 'Each Viva availability window needs valid start and end times.' };
  }
  if (new Set(availability.map((window) => roomKey(window.locationLabel))).size !== availability.length) {
    return { success: false, error: 'Each Viva room must be listed once.' };
  }
  const firstWindow = availability[0];
  if (!availability.every((window) => (
    window.startsAt.getTime() === firstWindow.startsAt.getTime()
    && window.endsAt.getTime() === firstWindow.endsAt.getTime()
  ))) {
    return { success: false, error: 'All Viva rooms must use the same availability window.' };
  }

  return { success: true, input: { roundId, availability } };
}

export function parseVivaAutomaticScheduleSaveInput(value: unknown):
  | { success: true; input: VivaAutomaticScheduleSaveInput }
  | { success: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value.schedules) || !Array.isArray(value.panelRooms)) {
    return { success: false, error: 'Provide an automatic Viva schedule draft to save.' };
  }

  const roundId = asObjectId(value.roundId);
  if (!roundId) return { success: false, error: 'Choose a valid Viva round.' };
  if (value.schedules.length === 0 || value.schedules.length > MAX_AUTOMATIC_SCHEDULE_ENTRIES) {
    return { success: false, error: 'Provide between 1 and 1,000 Viva schedule entries.' };
  }

  const schedules = value.schedules.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];

    const parsed = parseVivaScheduleInput({ ...candidate, roundId });
    return parsed.success ? [parsed.input] : [];
  });
  if (schedules.length !== value.schedules.length) {
    return { success: false, error: 'Every automatic Viva schedule entry must be valid.' };
  }
  if (new Set(schedules.map((schedule) => schedule.projectId)).size !== schedules.length) {
    return { success: false, error: 'A team can appear only once in an automatic Viva schedule draft.' };
  }
  const panelRooms = value.panelRooms.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];

    const panelId = asObjectId(candidate.panelId);
    const locationLabel = asLocationLabel(candidate.locationLabel);
    return panelId && locationLabel ? [{ panelId, locationLabel }] : [];
  });
  if (
    panelRooms.length === 0
    || panelRooms.length !== value.panelRooms.length
    || new Set(panelRooms.map(({ panelId }) => panelId)).size !== panelRooms.length
    || !schedules.every((schedule) => panelRooms.some(({ panelId }) => panelId === schedule.panelId))
  ) {
    return { success: false, error: 'Every scheduled panel needs one valid fixed room.' };
  }

  return { success: true, input: { roundId, panelRooms, schedules } };
}

export function parseVivaScheduleUpdateInput(value: unknown):
  | { success: true; sessionId: string; version: number; input: VivaScheduleInput }
  | { success: false; error: string } {
  const parsed = parseVivaScheduleInput(value);
  if (!parsed.success) return parsed;
  if (!isRecord(value)) return { success: false, error: 'Invalid Viva rescheduling details.' };

  const sessionId = asObjectId(value.sessionId);
  const version = asVersion(value.version);
  if (!sessionId || version === null) {
    return { success: false, error: 'Invalid Viva rescheduling details.' };
  }

  return { success: true, sessionId, version, input: parsed.input };
}

export function parseVivaSessionCancellationInput(value: unknown):
  | { success: true; input: VivaSessionCancellationInput }
  | { success: false; error: string } {
  if (!isRecord(value)) return { success: false, error: 'Invalid Viva cancellation request.' };

  const sessionId = asObjectId(value.sessionId);
  const version = asVersion(value.version);
  const cancellationReason = asCancellationReason(value.cancellationReason);
  if (!sessionId || version === null || !cancellationReason) {
    return { success: false, error: 'Provide a cancellation reason before cancelling this Viva session.' };
  }

  return { success: true, input: { sessionId, version, cancellationReason } };
}

export function parseVivaPanelSwapInput(value: unknown):
  | { success: true; input: VivaPanelSwapInput }
  | { success: false; error: string } {
  if (!isRecord(value) || !isRecord(value.first) || !isRecord(value.second)) {
    return { success: false, error: 'Choose two valid Viva sessions to swap.' };
  }

  const firstSessionId = asObjectId(value.first.sessionId);
  const secondSessionId = asObjectId(value.second.sessionId);
  const firstVersion = asVersion(value.first.version);
  const secondVersion = asVersion(value.second.version);
  if (
    !firstSessionId
    || !secondSessionId
    || firstSessionId === secondSessionId
    || firstVersion === null
    || secondVersion === null
  ) {
    return { success: false, error: 'Choose two different valid Viva sessions to swap.' };
  }

  return {
    success: true,
    input: {
      first: { sessionId: firstSessionId, version: firstVersion },
      second: { sessionId: secondSessionId, version: secondVersion },
    },
  };
}

function buildScheduleContext(
  input: VivaScheduleInput,
  round: VivaRoundRecord,
  panel: VivaPanelRecord,
  project: ProjectRecord
): { success: true; context: ScheduleContext } | { success: false; error: string } {
  if (!asIdList(round.projectIds).includes(input.projectId)) {
    return { success: false, error: 'This team is not selected for the Viva round.' };
  }
  if (String(panel.roundId) !== input.roundId) {
    return { success: false, error: 'The selected panel belongs to a different Viva round.' };
  }

  const targetPanelSize = Number(round.targetPanelSize);
  const minimumPanelSize = Number(round.minimumPanelSize);
  const vivaDurationMinutes = Number(round.vivaDurationMinutes);
  const panelExaminerIds = asIdList(panel.examinerIds);
  const panelLocation = asLocationLabel(panel.locationLabel);
  if (
    !Number.isSafeInteger(targetPanelSize)
    || !Number.isSafeInteger(minimumPanelSize)
    || !Number.isFinite(vivaDurationMinutes)
    || vivaDurationMinutes <= 0
    || panelExaminerIds.length < minimumPanelSize
    || panelExaminerIds.length > targetPanelSize
    || !isVivaPanelAdmin(panelExaminerIds, String(panel.panelAdminId || ''))
    || !panelLocation
    || roomKey(input.locationLabel) !== roomKey(panelLocation)
  ) {
    return { success: false, error: 'The selected panel cannot conduct this Viva session in the requested room.' };
  }

  return {
    success: true,
    context: {
      round,
      panel,
      project,
      panelExaminerIds,
      projectMemberIds: asIdList(project.members),
      vivaEndsAt: new Date(input.scheduledAt.getTime() + vivaDurationMinutes * 60_000),
    },
  };
}

function validateScheduleParticipants(
  context: ScheduleContext,
  activeParticipantsById: ReadonlyMap<string, unknown>
): string | null {
  if (!context.panelExaminerIds.every((examinerId) => activeParticipantsById.get(examinerId) === 'supervisor')) {
    return 'One or more selected panel teachers are no longer active.';
  }
  if (!context.projectMemberIds.some((memberId) => activeParticipantsById.get(memberId) === 'student')) {
    return 'The selected team has no active students.';
  }
  return null;
}

async function readScheduleContext(
  input: VivaScheduleInput,
  session: ClientSession
): Promise<{ success: true; context: ScheduleContext } | { success: false; error: string }> {
  const round = await VivaRound.findById(input.roundId)
    .select('_id projectIds targetPanelSize minimumPanelSize vivaDurationMinutes scheduleRevision')
    .session(session)
    .lean<VivaRoundRecord | null>();
  const panel = await VivaPanel.findById(input.panelId)
    .select('_id roundId examinerIds panelAdminId locationLabel')
    .session(session)
    .lean<VivaPanelRecord | null>();
  const project = await Project.findById(input.projectId)
    .select('_id supervisorId members')
    .session(session)
    .lean<ProjectRecord | null>();

  if (!round || !panel || !project) {
    return { success: false, error: 'The selected Viva round, team, or panel no longer exists.' };
  }
  const context = buildScheduleContext(input, round, panel, project);
  if (!context.success) return context;

  const participantIds = [...new Set([
    ...context.context.panelExaminerIds,
    ...context.context.projectMemberIds,
  ])];
  const activeParticipants = participantIds.length > 0
    ? await User.find({ _id: { $in: participantIds }, isActive: true })
        .select('_id role')
        .session(session)
        .lean<UserRecord[]>()
    : [];
  const activeParticipantsById = new Map(
    activeParticipants.map((participant) => [String(participant._id), participant.role])
  );
  const participantError = validateScheduleParticipants(context.context, activeParticipantsById);
  return participantError ? { success: false, error: participantError } : context;
}

function reservationFromScheduleContext(input: VivaScheduleInput, context: ScheduleContext): ScheduleReservation {
  return {
    scheduledAt: input.scheduledAt,
    vivaEndsAt: context.vivaEndsAt,
    panelExaminerIds: context.panelExaminerIds,
    projectMemberIds: context.projectMemberIds,
  };
}

function findReservationConflict(
  candidate: ScheduleReservation,
  reservations: readonly ScheduleReservation[]
): string | null {
  for (const reservation of reservations) {
    if (reservation.scheduledAt >= candidate.vivaEndsAt || reservation.vivaEndsAt <= candidate.scheduledAt) {
      continue;
    }
    if (hasOverlap(candidate.panelExaminerIds, reservation.panelExaminerIds)) {
      return 'A selected panel teacher is already booked during this time.';
    }
    if (hasOverlap(candidate.projectMemberIds, reservation.projectMemberIds)) {
      return 'A selected team member is already booked during this time.';
    }
  }

  return null;
}

function reservationsForSchedule(
  input: VivaScheduleInput,
  context: ScheduleContext,
  candidates: readonly VivaSessionRecord[],
  panelsById: ReadonlyMap<string, VivaPanelRecord>,
  projectsById: ReadonlyMap<string, ProjectRecord>,
  incompleteResourcesError: string
): { success: true; reservations: ScheduleReservation[] } | { success: false; error: string } {
  const reservations: ScheduleReservation[] = [];

  for (const candidate of candidates) {
    const scheduledAt = candidate.scheduledAt;
    const vivaEndsAt = candidate.vivaEndsAt;
    if (!(scheduledAt instanceof Date) || !(vivaEndsAt instanceof Date)) {
      return { success: false, error: incompleteResourcesError };
    }
    if (scheduledAt >= context.vivaEndsAt || vivaEndsAt <= input.scheduledAt) continue;

    const panel = panelsById.get(String(candidate.panelId));
    const project = projectsById.get(String(candidate.projectId));
    if (!panel || !project) return { success: false, error: incompleteResourcesError };

    reservations.push({
      scheduledAt,
      vivaEndsAt,
      panelExaminerIds: asIdList(panel.examinerIds),
      projectMemberIds: asIdList(project.members),
    });
  }

  return { success: true, reservations };
}

async function findScheduleConflict(
  input: VivaScheduleInput,
  context: ScheduleContext,
  session: ClientSession,
  excludedSessionId?: string | readonly string[]
): Promise<string | null> {
  const excludedSessionIds = typeof excludedSessionId === 'string'
    ? [excludedSessionId]
    : excludedSessionId;
  const candidates = await VivaSession.find({
    ...(excludedSessionIds?.length ? { _id: { $nin: excludedSessionIds } } : {}),
    cancelledAt: null,
    completedAt: null,
    scheduledAt: { $lt: context.vivaEndsAt },
    vivaEndsAt: { $gt: input.scheduledAt },
  })
    .select('_id panelId projectId scheduledAt vivaEndsAt')
    .session(session)
    .lean<VivaSessionRecord[]>();
  if (candidates.length === 0) return null;

  const panels = await VivaPanel.find({ _id: { $in: candidates.map((candidate) => candidate.panelId) } })
    .select('_id examinerIds')
    .session(session)
    .lean<VivaPanelRecord[]>();
  const projects = await Project.find({ _id: { $in: candidates.map((candidate) => candidate.projectId) } })
    .select('_id members')
    .session(session)
    .lean<ProjectRecord[]>();
  const reservations = reservationsForSchedule(
    input,
    context,
    candidates,
    new Map(panels.map((panel) => [String(panel._id), panel])),
    new Map(projects.map((project) => [String(project._id), project])),
    'An existing Viva schedule has incomplete resources. Resolve it before scheduling another session.'
  );
  if (!reservations.success) return reservations.error;

  return findReservationConflict(reservationFromScheduleContext(input, context), reservations.reservations);
}

async function hasExistingAttempt(
  input: VivaScheduleInput,
  session: ClientSession,
  excludedSessionId?: string | readonly string[]
): Promise<boolean> {
  const excludedSessionIds = typeof excludedSessionId === 'string'
    ? [excludedSessionId]
    : excludedSessionId;
  return Boolean(await VivaSession.exists({
    roundId: input.roundId,
    projectId: input.projectId,
    cancelledAt: null,
    ...(excludedSessionIds?.length ? { _id: { $nin: excludedSessionIds } } : {}),
  }).session(session));
}

async function validateSchedule(
  input: VivaScheduleInput,
  session: ClientSession,
  excludedSessionId?: string | readonly string[]
): Promise<{ success: true; context: ScheduleContext } | { success: false; error: string }> {
  const existingAttempt = await hasExistingAttempt(input, session, excludedSessionId);
  const context = await readScheduleContext(input, session);
  if (existingAttempt) {
    return { success: false, error: 'This team already has a Viva attempt in the selected round.' };
  }
  if (!context.success) return context;

  const conflictError = await findScheduleConflict(input, context.context, session, excludedSessionId);
  return conflictError ? { success: false, error: conflictError } : context;
}

class VivaPanelSwapAbort extends Error {
  constructor(readonly result: Extract<VivaPanelSwapResult, { success: false }>) {
    super(result.error);
  }
}

export async function swapVivaSessionPanels(
  input: VivaPanelSwapInput,
  actor: VivaScheduleActor
): Promise<VivaPanelSwapResult> {
  if (!mongoose.Types.ObjectId.isValid(actor.id)) {
    return { success: false, reason: 'not-found', error: 'The selected Viva sessions no longer exist.' };
  }

  try {
    return await withVivaTransaction(async (session) => {
      const sessionIds = [input.first.sessionId, input.second.sessionId];
      const records = await VivaSession.find({ _id: { $in: sessionIds } })
        .select('_id roundId panelId projectId scheduledAt vivaEndsAt startedAt completedAt cancelledAt locationLabel version')
        .session(session)
        .lean<VivaSessionRecord[]>();
      if (records.length !== 2) {
        return { success: false, reason: 'not-found', error: 'The selected Viva sessions no longer exist.' };
      }

      const recordsById = new Map(records.map((record) => [String(record._id), record]));
      const first = recordsById.get(input.first.sessionId);
      const second = recordsById.get(input.second.sessionId);
      if (!first || !second) {
        return { success: false, reason: 'not-found', error: 'The selected Viva sessions no longer exist.' };
      }
      if (String(first.roundId) !== String(second.roundId)) {
        return { success: false, reason: 'invalid', error: 'Panels can only be swapped within the same Viva round.' };
      }
      if (String(first.panelId) === String(second.panelId)) {
        return { success: false, reason: 'invalid', error: 'These teams already have the same panel.' };
      }
      if (
        first.startedAt instanceof Date
        || second.startedAt instanceof Date
        || first.completedAt instanceof Date
        || second.completedAt instanceof Date
        || first.cancelledAt instanceof Date
        || second.cancelledAt instanceof Date
        || !(first.scheduledAt instanceof Date)
        || !(second.scheduledAt instanceof Date)
      ) {
        return { success: false, reason: 'not-swappable', error: 'Only two unstarted scheduled sessions can swap panels.' };
      }
      if (asVersion(first.version) !== input.first.version || asVersion(second.version) !== input.second.version) {
        return { success: false, reason: 'concurrent-change', error: 'Another user changed this schedule. Reload before swapping panels.' };
      }

      const panels = await VivaPanel.find({ _id: { $in: [first.panelId, second.panelId] } })
        .select('_id locationLabel')
        .session(session)
        .lean<VivaPanelRecord[]>();
      const panelsById = new Map(panels.map((panel) => [String(panel._id), panel]));
      const firstTargetPanel = panelsById.get(String(second.panelId));
      const secondTargetPanel = panelsById.get(String(first.panelId));
      const firstLocation = firstTargetPanel && asLocationLabel(firstTargetPanel.locationLabel);
      const secondLocation = secondTargetPanel && asLocationLabel(secondTargetPanel.locationLabel);
      if (!firstTargetPanel || !secondTargetPanel || !firstLocation || !secondLocation) {
        return { success: false, reason: 'invalid', error: 'Both panels need valid fixed rooms before they can be swapped.' };
      }

      const firstInput: VivaScheduleInput = {
        roundId: String(first.roundId),
        panelId: String(second.panelId),
        projectId: String(first.projectId),
        scheduledAt: first.scheduledAt,
        locationLabel: firstLocation,
      };
      const secondInput: VivaScheduleInput = {
        roundId: String(second.roundId),
        panelId: String(first.panelId),
        projectId: String(second.projectId),
        scheduledAt: second.scheduledAt,
        locationLabel: secondLocation,
      };
      const firstValidation = await validateSchedule(firstInput, session, sessionIds);
      const secondValidation = await validateSchedule(secondInput, session, sessionIds);
      if (!firstValidation.success) return { success: false, reason: 'invalid', error: firstValidation.error };
      if (!secondValidation.success) return { success: false, reason: 'invalid', error: secondValidation.error };

      const pairConflict = findReservationConflict(
        reservationFromScheduleContext(firstInput, firstValidation.context),
        [reservationFromScheduleContext(secondInput, secondValidation.context)]
      );
      if (pairConflict) return { success: false, reason: 'invalid', error: pairConflict };
      if (!await reserveScheduleChange(firstValidation.context, session)) {
        return { success: false, reason: 'concurrent-change', error: 'Another administrator changed this schedule. Reload before swapping panels.' };
      }

      const write = await VivaSession.bulkWrite([
        {
          updateOne: {
            filter: { _id: first._id, version: input.first.version, startedAt: null, completedAt: null, cancelledAt: null },
            update: { $set: { panelId: second.panelId, locationLabel: firstLocation }, $inc: { version: 1 } },
          },
        },
        {
          updateOne: {
            filter: { _id: second._id, version: input.second.version, startedAt: null, completedAt: null, cancelledAt: null },
            update: { $set: { panelId: first.panelId, locationLabel: secondLocation }, $inc: { version: 1 } },
          },
        },
      ], { session, ordered: true });
      if (write.modifiedCount !== 2) {
        throw new VivaPanelSwapAbort({
          success: false,
          reason: 'concurrent-change',
          error: 'Another user changed this schedule. Reload before swapping panels.',
        });
      }

      await VivaAuditEvent.insertMany(sessionIds.map((sessionId) => ({
        roundId: first.roundId,
        sessionId,
        event: 'session-panel-swapped',
        actorId: actor.id,
        actorRole: 'admin',
        actorName: actor.name,
        actorRollNo: actor.rollNo,
      })), { session, ordered: true });

      const updated = await VivaSession.find({ _id: { $in: sessionIds } })
        .select('_id roundId panelId projectId scheduledAt vivaEndsAt startedAt completedAt cancelledAt cancellationReason locationLabel version')
        .session(session)
        .lean<VivaSessionRecord[]>();
      const updatedById = new Map(updated.map((record) => [String(record._id), record]));
      const firstRecord = updatedById.get(input.first.sessionId);
      const secondRecord = updatedById.get(input.second.sessionId);
      const firstSchedule = firstRecord ? toScheduleDto(firstRecord) : null;
      const secondSchedule = secondRecord ? toScheduleDto(secondRecord) : null;
      if (!firstSchedule || !secondSchedule) throw new Error('Swapped Viva sessions could not be serialized.');
      return { success: true, schedules: [firstSchedule, secondSchedule] };
    });
  } catch (error) {
    if (error instanceof VivaPanelSwapAbort) return error.result;
    throw error;
  }
}

async function reserveScheduleChange(context: ScheduleContext, session: ClientSession): Promise<boolean> {
  const revision = asVersion(context.round.scheduleRevision) || 0;
  const revisionFilter = revision === 0
    ? { $or: [{ scheduleRevision: 0 }, { scheduleRevision: { $exists: false } }] }
    : { scheduleRevision: revision };
  const reservedRound = await VivaRound.findOneAndUpdate(
    { _id: context.round._id, ...revisionFilter },
    { $inc: { scheduleRevision: 1 } },
    { session }
  ).lean<VivaRoundRecord | null>();

  return Boolean(reservedRound);
}

async function writeScheduleAudit(
  roundId: string,
  sessionId: unknown,
  actor: VivaScheduleActor,
  session: ClientSession
) {
  await recordVivaAuditEvent(
    {
      roundId,
      sessionId: String(sessionId),
      event: 'session-scheduled',
      actorId: actor.id,
      actorRole: 'admin',
      actorName: actor.name,
      actorRollNo: actor.rollNo,
    },
    session
  );
}

function availabilitySlots(
  window: Pick<VivaScheduleAvailabilityInput, 'startsAt' | 'endsAt'>,
  vivaDurationMinutes: number
): AutomaticScheduleSlot[] {
  const durationMilliseconds = vivaDurationMinutes * 60_000;
  const slots: AutomaticScheduleSlot[] = [];

  for (
    let startsAt = new Date(window.startsAt);
    startsAt.getTime() + durationMilliseconds <= window.endsAt.getTime();
    startsAt = new Date(startsAt.getTime() + durationMilliseconds)
  ) {
    slots.push({
      id: slots.length,
      scheduledAt: startsAt,
      vivaEndsAt: new Date(startsAt.getTime() + durationMilliseconds),
    });
    if (slots.length > MAX_AUTOMATIC_SCHEDULE_SLOTS) return [];
  }

  return slots;
}

async function readExistingScheduleReservations(
  startsAt: Date,
  endsAt: Date
): Promise<{ reservations: ScheduleReservation[] } | { error: string }> {
  const sessions = await VivaSession.find({
    cancelledAt: null,
    completedAt: null,
    scheduledAt: { $lt: endsAt },
    vivaEndsAt: { $gt: startsAt },
  })
    .select('_id panelId projectId scheduledAt vivaEndsAt')
    .lean<VivaSessionRecord[]>();
  if (sessions.length === 0) return { reservations: [] };

  const [panels, projects] = await Promise.all([
    VivaPanel.find({ _id: { $in: sessions.map((scheduledSession) => scheduledSession.panelId) } })
      .select('_id examinerIds')
      .lean<VivaPanelRecord[]>(),
    Project.find({ _id: { $in: sessions.map((scheduledSession) => scheduledSession.projectId) } })
      .select('_id members')
      .lean<ProjectRecord[]>(),
  ]);
  const panelMembersById = new Map(
    panels.map((panel) => [String(panel._id), asIdList(panel.examinerIds)])
  );
  const projectMembersById = new Map(
    projects.map((project) => [String(project._id), asIdList(project.members)])
  );
  const reservations: ScheduleReservation[] = [];

  for (const scheduledSession of sessions) {
    const panelExaminerIds = panelMembersById.get(String(scheduledSession.panelId));
    const projectMemberIds = projectMembersById.get(String(scheduledSession.projectId));
    if (
      !panelExaminerIds
      || !projectMemberIds
      || !(scheduledSession.scheduledAt instanceof Date)
      || !(scheduledSession.vivaEndsAt instanceof Date)
    ) {
      return { error: 'An existing Viva schedule has incomplete resources. Resolve it before generating a draft.' };
    }
    reservations.push({
      scheduledAt: scheduledSession.scheduledAt,
      vivaEndsAt: scheduledSession.vivaEndsAt,
      panelExaminerIds,
      projectMemberIds,
    });
  }

  return { reservations };
}

function markOccupiedSlots(
  occupiedSlotsByResource: Map<string, Uint32Array>,
  resourceIds: readonly string[],
  slotIds: readonly number[],
  wordCount: number
) {
  for (const resourceId of resourceIds) {
    let occupiedSlotIds = occupiedSlotsByResource.get(resourceId);
    if (!occupiedSlotIds) {
      occupiedSlotIds = new Uint32Array(wordCount);
      occupiedSlotsByResource.set(resourceId, occupiedSlotIds);
    }
    for (const slotId of slotIds) {
      occupiedSlotIds[slotId >>> 5] |= 1 << (slotId & 31);
    }
  }
}

function hasOccupiedSlot(occupiedSlots: Uint32Array | undefined, slotId: number): boolean {
  const occupiedWord = occupiedSlots?.[slotId >>> 5];
  return occupiedWord !== undefined && Boolean(occupiedWord & (1 << (slotId & 31)));
}

function slotIdsOverlappingInterval(
  slots: readonly AutomaticScheduleSlot[],
  scheduledAt: Date,
  vivaEndsAt: Date
): number[] {
  const overlappingSlotIds: number[] = [];
  for (const slot of slots) {
    if (slot.scheduledAt < vivaEndsAt && slot.vivaEndsAt > scheduledAt) {
      overlappingSlotIds.push(slot.id);
    }
  }
  return overlappingSlotIds;
}

function createAutomaticScheduleOccupancy(
  slots: readonly AutomaticScheduleSlot[],
  reservations: readonly ScheduleReservation[]
): AutomaticScheduleOccupancy {
  const wordCount = Math.ceil(slots.length / 32);
  const blockedSlotsByTeacher = new Map<string, Uint32Array>();
  const blockedSlotsByStudent = new Map<string, Uint32Array>();
  const overlappingSlotIds = slots.map((slot) => (
    slotIdsOverlappingInterval(slots, slot.scheduledAt, slot.vivaEndsAt)
  ));
  const orderedSlotIds = [...slots]
    .sort((first, second) => first.scheduledAt.getTime() - second.scheduledAt.getTime() || first.id - second.id)
    .map((slot) => slot.id);
  const validSlotBits = new Uint32Array(wordCount);
  for (const slot of slots) validSlotBits[slot.id >>> 5] |= 1 << (slot.id & 31);

  for (const reservation of reservations) {
    const slotIds = slotIdsOverlappingInterval(slots, reservation.scheduledAt, reservation.vivaEndsAt);
    markOccupiedSlots(blockedSlotsByTeacher, reservation.panelExaminerIds, slotIds, wordCount);
    markOccupiedSlots(blockedSlotsByStudent, reservation.projectMemberIds, slotIds, wordCount);
  }

  return {
    blockedSlotsByTeacher,
    blockedSlotsByStudent,
    overlappingSlotIds,
    orderedSlotIds,
    validSlotBits,
  };
}

function resourceHasOccupiedSlot(
  occupiedSlotsByResource: ReadonlyMap<string, Uint32Array>,
  resourceIds: readonly string[],
  slotId: number
): boolean {
  return resourceIds.some((resourceId) => hasOccupiedSlot(occupiedSlotsByResource.get(resourceId), slotId));
}

function automaticScheduleOptionIsAvailable(
  project: AutomaticScheduleProject,
  panel: AutomaticSchedulePanel,
  slot: AutomaticScheduleSlot,
  occupancy: AutomaticScheduleOccupancy
): boolean {
  return !resourceHasOccupiedSlot(occupancy.blockedSlotsByTeacher, panel.examinerIds, slot.id)
    && !resourceHasOccupiedSlot(occupancy.blockedSlotsByStudent, project.memberIds, slot.id);
}

function reserveAutomaticScheduleOption(
  project: AutomaticScheduleProject,
  option: AutomaticScheduleOption,
  occupancy: AutomaticScheduleOccupancy
) {
  const overlappingSlotIds = occupancy.overlappingSlotIds[option.slot.id];
  const wordCount = occupancy.validSlotBits.length;
  markOccupiedSlots(occupancy.blockedSlotsByTeacher, option.panel.examinerIds, overlappingSlotIds, wordCount);
  markOccupiedSlots(occupancy.blockedSlotsByStudent, project.memberIds, overlappingSlotIds, wordCount);
}

function firstAutomaticScheduleOption(
  project: AutomaticScheduleProject,
  panels: readonly AutomaticSchedulePanel[],
  slots: readonly AutomaticScheduleSlot[],
  occupancy: AutomaticScheduleOccupancy,
  panelWorkloads: ReadonlyMap<string, number>
): AutomaticScheduleOption | null {
  let first: AutomaticScheduleOption | null = null;

  for (const panel of panels) {
    for (const slotId of occupancy.orderedSlotIds) {
      const slot = slots[slotId];
      if (!automaticScheduleOptionIsAvailable(project, panel, slot, occupancy)) continue;

      const option = { panel, slot };
      if (
        !first
        || (panelWorkloads.get(option.panel.id) || 0) < (panelWorkloads.get(first.panel.id) || 0)
        || (
          (panelWorkloads.get(option.panel.id) || 0) === (panelWorkloads.get(first.panel.id) || 0)
          && option.slot.scheduledAt.getTime() < first.slot.scheduledAt.getTime()
        )
      ) {
        first = option;
      }
      break;
    }
  }

  return first;
}

function shuffled<T>(values: readonly T[]): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

async function previewPanelRooms(
  panels: readonly AutomaticSchedulePanel[],
  rooms: readonly string[]
): Promise<{ success: true; panelRooms: VivaAutomaticSchedulePreview['panelRooms'] } | { success: false; error: string }> {
  const sessions = await VivaSession.find({
    panelId: { $in: panels.map((panel) => panel.id) },
    scheduledAt: { $type: 'date' },
  })
    .select('panelId locationLabel')
    .lean<VivaSessionRecord[]>();
  const historicalRoomsByPanel = new Map<string, string[]>();
  for (const session of sessions) {
    const room = asLocationLabel(session.locationLabel);
    if (!room) continue;
    const panelId = String(session.panelId);
    historicalRoomsByPanel.set(panelId, [...(historicalRoomsByPanel.get(panelId) || []), room]);
  }

  const panelRooms = new Map<string, string>();
  const panelsNeedingRooms: AutomaticSchedulePanel[] = [];
  for (const panel of panels) {
    const currentRoom = asLocationLabel(panel.locationLabel);
    const historicalRooms = [...new Map(
      (historicalRoomsByPanel.get(panel.id) || []).map((room) => [roomKey(room), room])
    ).values()];
    if (historicalRooms.length > 1) {
      return {
        success: false,
        error: 'An existing panel has sessions in more than one room. Resolve its room history before scheduling again.',
      };
    }
    if (currentRoom && historicalRooms.length > 0 && roomKey(currentRoom) !== roomKey(historicalRooms[0])) {
      return {
        success: false,
        error: 'An existing panel room does not match its scheduled sessions. Resolve the room history before scheduling again.',
      };
    }
    const fixedRoom = currentRoom || historicalRooms[0];
    if (fixedRoom) panelRooms.set(panel.id, fixedRoom);
    else panelsNeedingRooms.push(panel);
  }

  const shuffledRooms = shuffled(rooms);
  for (const [index, panel] of shuffled(panelsNeedingRooms).entries()) {
    panelRooms.set(panel.id, shuffledRooms[index % shuffledRooms.length]);
  }

  return {
    success: true,
    panelRooms: panels.map((panel) => ({ panelId: panel.id, locationLabel: panelRooms.get(panel.id) || '' })),
  };
}

export async function previewAutomaticVivaSchedule(
  input: VivaAutomaticScheduleInput
): Promise<VivaAutomaticSchedulePreviewResult> {
  const round = await VivaRound.findById(input.roundId)
    .select('_id projectIds targetPanelSize minimumPanelSize vivaDurationMinutes confirmedAt')
    .lean<VivaRoundRecord | null>();
  if (!round) {
    return { success: false, reason: 'not-found', error: 'This Viva round no longer exists.' };
  }
  if (round.confirmedAt) return { success: false, reason: 'invalid', error: 'This Viva round is confirmed and cannot be scheduled.' };

  const vivaDurationMinutes = Number(round.vivaDurationMinutes);
  if (!Number.isFinite(vivaDurationMinutes) || vivaDurationMinutes <= 0) {
    return { success: false, reason: 'invalid', error: 'This Viva round has an invalid session duration.' };
  }
  const slots = availabilitySlots(input.availability[0], vivaDurationMinutes);
  if (slots.length === 0) {
    return {
      success: false,
      reason: 'invalid',
      error: 'Availability must contain at least one complete Viva slot and no more than 1,000 slots.',
    };
  }

  const projectIds = asIdList(round.projectIds);
  const [projects, panels, scheduledAttempts, existingReservations] = await Promise.all([
    Project.find({ _id: { $in: projectIds } }).select('_id supervisorId members').lean<ProjectRecord[]>(),
    VivaPanel.find({ roundId: input.roundId }).select('_id examinerIds panelAdminId locationLabel').lean<VivaPanelRecord[]>(),
    VivaSession.find({ roundId: input.roundId, cancelledAt: null }).select('projectId panelId').lean<VivaSessionRecord[]>(),
    readExistingScheduleReservations(slots[0].scheduledAt, slots[slots.length - 1].vivaEndsAt),
  ]);
  if ('error' in existingReservations) {
    return { success: false, reason: 'invalid', error: existingReservations.error };
  }

  const targetPanelSize = Number(round.targetPanelSize);
  const minimumPanelSize = Number(round.minimumPanelSize);
  const panelExaminerIds = panels.flatMap((panel) => asIdList(panel.examinerIds));
  const projectMemberIds = projects.flatMap((project) => asIdList(project.members));
  const users = await User.find({
    _id: { $in: [...new Set([...panelExaminerIds, ...projectMemberIds])] },
    isActive: true,
  })
    .select('_id role')
    .lean<Array<UserRecord & { role?: unknown }>>();
  const activeSupervisorIds = new Set(
    users.filter((user) => user.role === 'supervisor').map((user) => String(user._id))
  );
  const activeStudentIds = new Set(
    users.filter((user) => user.role === 'student').map((user) => String(user._id))
  );
  const validPanels = panels.flatMap((panel) => {
    const examinerIds = asIdList(panel.examinerIds);
    const panelId = String(panel._id);
    if (
      !mongoose.Types.ObjectId.isValid(panelId)
      || examinerIds.length < minimumPanelSize
      || examinerIds.length > targetPanelSize
      || !isVivaPanelAdmin(examinerIds, String(panel.panelAdminId || ''))
      || !examinerIds.every((examinerId) => activeSupervisorIds.has(examinerId))
    ) {
      return [];
    }
    return [{
      id: panelId,
      examinerIds,
      locationLabel: asLocationLabel(panel.locationLabel) || '',
    }];
  });
  if (validPanels.length === 0) {
    return { success: false, reason: 'invalid', error: 'No valid Viva panel is available.' };
  }
  const panelRooms = await previewPanelRooms(
    validPanels,
    input.availability.map(({ locationLabel }) => locationLabel)
  );
  if (!panelRooms.success) return { success: false, reason: 'invalid', error: panelRooms.error };
  const roomsByPanelId = new Map(panelRooms.panelRooms.map(({ panelId, locationLabel }) => [panelId, locationLabel]));
  const projectsById = new Map(projects.map((project) => [String(project._id), project]));
  const attemptedProjectIds = new Set(scheduledAttempts.map((scheduledAttempt) => String(scheduledAttempt.projectId)));
  const panelWorkloads = new Map<string, number>();
  for (const scheduledAttempt of scheduledAttempts) {
    const panelId = String(scheduledAttempt.panelId);
    panelWorkloads.set(panelId, (panelWorkloads.get(panelId) || 0) + 1);
  }

  const schedulableProjects: AutomaticScheduleProject[] = [];
  const unplaced: VivaAutomaticSchedulePreview['unplaced'] = [];
  for (const projectId of projectIds) {
    if (attemptedProjectIds.has(projectId)) {
      unplaced.push({ projectId, reason: 'This team already has a Viva attempt in the selected round.' });
      continue;
    }

    const project = projectsById.get(projectId);
    const memberIds = project ? asIdList(project.members) : [];
    if (!project) {
      unplaced.push({ projectId, reason: 'This selected team is no longer available.' });
      continue;
    }
    if (!memberIds.some((memberId) => activeStudentIds.has(memberId))) {
      unplaced.push({ projectId, reason: 'This team has no active students.' });
      continue;
    }
    schedulableProjects.push({ id: projectId, memberIds });
  }

  const occupancy = createAutomaticScheduleOccupancy(slots, existingReservations.reservations);
  const scheduled: VivaAutomaticScheduleDraft[] = [];

  for (const project of shuffled(schedulableProjects)) {
    if (scheduled.length >= MAX_AUTOMATIC_SCHEDULE_ENTRIES) {
      unplaced.push({ projectId: project.id, reason: 'This automatic schedule is limited to 1,000 sessions at a time.' });
      continue;
    }
    const option = firstAutomaticScheduleOption(
      project,
      shuffled(validPanels),
      slots,
      occupancy,
      panelWorkloads
    );
    if (!option) {
      unplaced.push({ projectId: project.id, reason: 'No available Viva slot remains after constrained teams were placed.' });
      continue;
    }

    scheduled.push({
      projectId: project.id,
      panelId: option.panel.id,
      scheduledAt: option.slot.scheduledAt.toISOString(),
      vivaEndsAt: option.slot.vivaEndsAt.toISOString(),
      locationLabel: roomsByPanelId.get(option.panel.id) || '',
    });
    reserveAutomaticScheduleOption(project, option, occupancy);
    panelWorkloads.set(option.panel.id, (panelWorkloads.get(option.panel.id) || 0) + 1);
  }

  return { success: true, draft: { panelRooms: panelRooms.panelRooms, scheduled, unplaced } };
}

async function validateAutomaticScheduleBatch(
  input: VivaAutomaticScheduleSaveInput,
  session: ClientSession
): Promise<{ success: true; contexts: ScheduleContext[] } | { success: false; error: string }> {
  const round = await VivaRound.findById(input.roundId)
    .select('_id projectIds targetPanelSize minimumPanelSize vivaDurationMinutes scheduleRevision confirmedAt')
    .session(session)
    .lean<VivaRoundRecord | null>();
  if (!round) {
    return { success: false, error: 'The selected Viva round, team, or panel no longer exists.' };
  }
  if (round.confirmedAt) return { success: false, error: 'This Viva round is confirmed and cannot be scheduled.' };

  const targetPanelSize = Number(round.targetPanelSize);
  const minimumPanelSize = Number(round.minimumPanelSize);
  const vivaDurationMinutes = Number(round.vivaDurationMinutes);
  if (
    !Number.isSafeInteger(targetPanelSize)
    || !Number.isSafeInteger(minimumPanelSize)
    || !Number.isFinite(vivaDurationMinutes)
    || vivaDurationMinutes <= 0
  ) {
    return { success: false, error: 'The selected panel cannot conduct a Viva session.' };
  }

  const projectIds = [...new Set(input.schedules.map((schedule) => schedule.projectId))];
  const panelIds = [...new Set(input.schedules.map((schedule) => schedule.panelId))];
  const startsAt = new Date(Math.min(...input.schedules.map((schedule) => schedule.scheduledAt.getTime())));
  const endsAt = new Date(Math.max(...input.schedules.map((schedule) => (
    schedule.scheduledAt.getTime() + vivaDurationMinutes * 60_000
  ))));
  const sessions = await VivaSession.find({
    $or: [
      { roundId: input.roundId, projectId: { $in: projectIds }, cancelledAt: null },
      {
        cancelledAt: null,
        completedAt: null,
        scheduledAt: { $lt: endsAt },
        vivaEndsAt: { $gt: startsAt },
      },
    ],
  })
    .select('_id roundId panelId projectId scheduledAt vivaEndsAt completedAt')
    .session(session)
    .lean<VivaSessionRecord[]>();
  const existingAttemptProjectIds = new Set(
    sessions
      .filter((scheduledSession) => (
        String(scheduledSession.roundId) === input.roundId
        && projectIds.includes(String(scheduledSession.projectId))
      ))
      .map((scheduledSession) => String(scheduledSession.projectId))
  );
  const overlappingSessions = sessions.filter((scheduledSession) => (
    !(scheduledSession.completedAt instanceof Date)
    && scheduledSession.scheduledAt instanceof Date
    && scheduledSession.vivaEndsAt instanceof Date
    && scheduledSession.scheduledAt < endsAt
    && scheduledSession.vivaEndsAt > startsAt
  ));
  const resourcePanelIds = [...new Set([
    ...panelIds,
    ...overlappingSessions.map((scheduledSession) => String(scheduledSession.panelId)),
  ])].filter((id) => mongoose.Types.ObjectId.isValid(id));
  const resourceProjectIds = [...new Set([
    ...projectIds,
    ...overlappingSessions.map((scheduledSession) => String(scheduledSession.projectId)),
  ])].filter((id) => mongoose.Types.ObjectId.isValid(id));
  const panels = await VivaPanel.find({ _id: { $in: resourcePanelIds } })
    .select('_id roundId examinerIds panelAdminId locationLabel')
    .session(session)
    .lean<VivaPanelRecord[]>();
  const projects = await Project.find({ _id: { $in: resourceProjectIds } })
    .select('_id supervisorId members')
    .session(session)
    .lean<ProjectRecord[]>();
  const panelsById = new Map(panels.map((panel) => [String(panel._id), panel]));
  const projectsById = new Map(projects.map((project) => [String(project._id), project]));
  const participantIds = [...new Set(input.schedules.flatMap((schedule) => {
    const panel = panelsById.get(schedule.panelId);
    const project = projectsById.get(schedule.projectId);
    return [
      ...asIdList(panel?.examinerIds),
      ...asIdList(project?.members),
    ];
  }))];
  const activeParticipants = participantIds.length > 0
    ? await User.find({ _id: { $in: participantIds }, isActive: true })
        .select('_id role')
        .session(session)
        .lean<UserRecord[]>()
    : [];
  const activeParticipantsById = new Map(
    activeParticipants.map((participant) => [String(participant._id), participant.role])
  );
  const contexts: ScheduleContext[] = [];
  const draftReservations: ScheduleReservation[] = [];

  for (const scheduleInput of input.schedules) {
    if (existingAttemptProjectIds.has(scheduleInput.projectId)) {
      return { success: false, error: 'This team already has a Viva attempt in the selected round.' };
    }

    const panel = panelsById.get(scheduleInput.panelId);
    const project = projectsById.get(scheduleInput.projectId);
    if (!panel || !project) {
      return { success: false, error: 'The selected Viva round, team, or panel no longer exists.' };
    }
    const context = buildScheduleContext(scheduleInput, round, panel, project);
    if (!context.success) return context;
    const participantError = validateScheduleParticipants(context.context, activeParticipantsById);
    if (participantError) return { success: false, error: participantError };

    const existingReservations = reservationsForSchedule(
      scheduleInput,
      context.context,
      overlappingSessions,
      panelsById,
      projectsById,
      'An existing Viva schedule has incomplete resources. Resolve it before scheduling another session.'
    );
    if (!existingReservations.success) return existingReservations;

    const reservation = reservationFromScheduleContext(scheduleInput, context.context);
    const existingConflict = findReservationConflict(reservation, existingReservations.reservations);
    if (existingConflict) return { success: false, error: existingConflict };

    const draftConflict = findReservationConflict(reservation, draftReservations);
    if (draftConflict) return { success: false, error: draftConflict };

    contexts.push(context.context);
    draftReservations.push(reservation);
  }

  return { success: true, contexts };
}

async function persistAutomaticPanelRooms(
  input: VivaAutomaticScheduleSaveInput,
  session: ClientSession
): Promise<string | null> {
  const panelIds = input.panelRooms.map(({ panelId }) => panelId);
  const panels = await VivaPanel.find({ _id: { $in: panelIds }, roundId: input.roundId })
    .select('_id locationLabel')
    .session(session)
    .lean<VivaPanelRecord[]>();
  const historicalSessions = await VivaSession.find({
    panelId: { $in: panelIds },
    scheduledAt: { $type: 'date' },
  })
    .select('panelId locationLabel')
    .session(session)
    .lean<VivaSessionRecord[]>();
  if (panels.length !== panelIds.length) {
    return 'One or more scheduled panels no longer belongs to this Viva round.';
  }

  const panelsById = new Map(panels.map((panel) => [String(panel._id), panel]));
  const historicalRoomsByPanel = new Map<string, string[]>();
  for (const historicalSession of historicalSessions) {
    const room = asLocationLabel(historicalSession.locationLabel);
    if (!room) continue;
    const panelId = String(historicalSession.panelId);
    historicalRoomsByPanel.set(panelId, [...(historicalRoomsByPanel.get(panelId) || []), room]);
  }

  for (const panelRoom of input.panelRooms) {
    const panel = panelsById.get(panelRoom.panelId);
    if (!panel) return 'One or more scheduled panels no longer belongs to this Viva round.';

    const persistedRoom = asLocationLabel(panel.locationLabel);
    const historicalRooms = [...new Map(
      (historicalRoomsByPanel.get(panelRoom.panelId) || []).map((room) => [roomKey(room), room])
    ).values()];
    if (historicalRooms.length > 1) {
      return 'An existing panel has sessions in more than one room. Resolve its room history before scheduling again.';
    }
    const expectedRoom = persistedRoom || historicalRooms[0] || panelRoom.locationLabel;
    if (
      roomKey(expectedRoom) !== roomKey(panelRoom.locationLabel)
      || (persistedRoom && historicalRooms[0] && roomKey(persistedRoom) !== roomKey(historicalRooms[0]))
    ) {
      return 'A panel room is already fixed and cannot be changed.';
    }

    if (!persistedRoom) {
      const write = await VivaPanel.updateOne(
        {
          _id: panelRoom.panelId,
          roundId: input.roundId,
          $or: [
            { locationLabel: '' },
            { locationLabel: null },
            { locationLabel: { $exists: false } },
          ],
        },
        { $set: { locationLabel: expectedRoom } },
        { session, runValidators: true }
      );
      if (write.modifiedCount === 0) {
        const current = await VivaPanel.findById(panelRoom.panelId)
          .select('locationLabel')
          .session(session)
          .lean<VivaPanelRecord | null>();
        if (!current || roomKey(asLocationLabel(current.locationLabel) || '') !== roomKey(expectedRoom)) {
          return 'Another administrator changed a panel room. Generate a fresh schedule draft.';
        }
      }
    }
  }

  return null;
}

export async function applyAutomaticVivaSchedule(
  input: VivaAutomaticScheduleSaveInput,
  actor: VivaScheduleActor
): Promise<VivaAutomaticScheduleSaveResult> {
  try {
    return await withVivaTransaction(async (session) => {
      const panelRoomError = await persistAutomaticPanelRooms(input, session);
      if (panelRoomError) return { success: false, reason: 'invalid', error: panelRoomError };

      const validation = await validateAutomaticScheduleBatch(input, session);
      if (!validation.success) return { success: false, reason: 'invalid', error: validation.error };

      if (!await reserveScheduleChange(validation.contexts[0], session)) {
        return {
          success: false,
          reason: 'concurrent-change',
          error: 'Another administrator changed this schedule. Generate a fresh draft before saving.',
        };
      }

      const savedSessions = await VivaSession.insertMany(
        input.schedules.map((scheduleInput, index) => ({
          roundId: input.roundId,
          panelId: scheduleInput.panelId,
          projectId: scheduleInput.projectId,
          scheduledAt: scheduleInput.scheduledAt,
          vivaEndsAt: validation.contexts[index].vivaEndsAt,
          locationLabel: scheduleInput.locationLabel,
        })),
        { session, ordered: true }
      );
      await VivaAuditEvent.insertMany(
        savedSessions.map((vivaSession) => ({
          roundId: input.roundId,
          sessionId: String(vivaSession._id),
          event: 'session-scheduled',
          actorId: actor.id,
          actorRole: 'admin',
          actorName: actor.name,
          actorRollNo: actor.rollNo,
        })),
        { session, ordered: true }
      );
      const schedules = savedSessions.map((vivaSession) => {
        const schedule = toScheduleDto(vivaSession.toObject());
        if (!schedule) throw new Error('Automatic Viva schedule could not be serialized.');
        return schedule;
      });

      return { success: true, schedules };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'A team was scheduled by another administrator. Generate a fresh draft before saving.',
      };
    }
    throw error;
  }
}

export async function getVivaSchedules(): Promise<VivaScheduleDto[]> {
  const sessions = await VivaSession.find({ scheduledAt: { $type: 'date' } })
    .select('_id roundId panelId projectId scheduledAt vivaEndsAt startedAt completedAt cancelledAt cancellationReason locationLabel version')
    .sort({ scheduledAt: 1, _id: 1 })
    .lean<VivaSessionRecord[]>();

  return sessions.flatMap((session) => {
    const schedule = toScheduleDto(session);
    return schedule ? [schedule] : [];
  });
}

export async function getConfirmedVivaSchedulesForStudent(studentId: string): Promise<VivaStudentSessionDto[]> {
  if (!mongoose.Types.ObjectId.isValid(studentId)) return [];
  const project = await Project.findOne({ members: studentId }).select('_id').lean<{ _id: unknown } | null>();
  if (!project) return [];
  const rounds = await VivaRound.find({ confirmedAt: { $type: 'date' } }).select('_id name').lean<Array<{ _id: unknown; name?: unknown }>>();
  if (rounds.length === 0) return [];
  const names = new Map(rounds.map((round) => [String(round._id), typeof round.name === 'string' ? round.name : 'Viva round']));
  const sessions = await VivaSession.find({ roundId: { $in: rounds.map((round) => round._id) }, projectId: project._id, scheduledAt: { $type: 'date' } })
    .select('_id roundId panelId projectId scheduledAt vivaEndsAt startedAt completedAt cancelledAt cancellationReason locationLabel version')
    .sort({ scheduledAt: 1, _id: 1 }).lean<VivaSessionRecord[]>();
  const panels = await VivaPanel.find({ _id: { $in: sessions.map((session) => session.panelId) } })
    .select('_id examinerIds panelAdminId')
    .lean<VivaPanelRecord[]>();
  const panelsById = new Map(panels.map((panel) => [String(panel._id), panel]));
  const participantIds = [...new Set(panels.flatMap((panel) => [
    ...asIdList(panel.examinerIds),
    String(panel.panelAdminId || ''),
  ]).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const people = participantIds.length > 0
    ? await User.find({ _id: { $in: participantIds } }).select('_id name rollNo').lean<UserRecord[]>()
    : [];
  const peopleById = new Map<string, { id: string; name: string; rollNo: string }>();
  for (const person of people) {
    const name = typeof person.name === 'string' ? person.name.trim() : '';
    const rollNo = typeof person.rollNo === 'string' ? person.rollNo.trim() : '';
    if (name && rollNo) {
      peopleById.set(String(person._id), { id: String(person._id), name, rollNo });
    }
  }

  return sessions.flatMap((session) => {
    const schedule = toScheduleDto(session);
    const panel = panelsById.get(String(session.panelId));
    const panelAdminId = panel ? String(panel.panelAdminId || '') : '';
    const members = panel ? asIdList(panel.examinerIds).map((id) => peopleById.get(id)) : [];
    const admin = peopleById.get(panelAdminId);
    if (!schedule || !panel || !admin || members.some((member) => !member)) return [];

    return [{
      ...schedule,
      roundName: names.get(schedule.roundId) || 'Viva round',
      panel: {
        id: String(panel._id),
        admin,
        members: members.filter((member): member is NonNullable<typeof member> => Boolean(member)),
      },
    }];
  });
}

export async function cancelVivaSession(
  input: VivaSessionCancellationInput,
  actor: VivaScheduleActor,
  cancelledAt = new Date()
): Promise<VivaSessionCancellationResult> {
  if (
    !mongoose.Types.ObjectId.isValid(input.sessionId)
    || !mongoose.Types.ObjectId.isValid(actor.id)
  ) {
    return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
  }
  if (
    asVersion(input.version) === null
    || !asCancellationReason(input.cancellationReason)
    || !(cancelledAt instanceof Date)
    || !Number.isFinite(cancelledAt.getTime())
  ) {
    return { success: false, reason: 'invalid', error: 'Provide a valid cancellation reason.' };
  }

  return withVivaTransaction(async (session) => {
    const existing = await VivaSession.findById(input.sessionId)
      .select('_id roundId scheduledAt startedAt completedAt cancelledAt version')
      .session(session)
      .lean<VivaSessionRecord | null>();
    if (!existing) {
      return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
    }
    if (existing.completedAt instanceof Date) {
      return { success: false, reason: 'not-cancellable', error: 'A completed Viva session cannot be cancelled.' };
    }
    if (existing.cancelledAt instanceof Date) {
      return { success: false, reason: 'not-cancellable', error: 'This Viva session is already cancelled.' };
    }
    if (!(existing.scheduledAt instanceof Date)) {
      return { success: false, reason: 'not-cancellable', error: 'Only scheduled or active Viva sessions can be cancelled.' };
    }
    if (asVersion(existing.version) !== input.version) {
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'Another administrator changed this Viva session. Reload before cancelling it.',
      };
    }

    const cancelledSession = await VivaSession.findOneAndUpdate(
      {
        _id: input.sessionId,
        version: input.version,
        scheduledAt: { $type: 'date' },
        completedAt: null,
        cancelledAt: null,
      },
      {
        $set: { cancelledAt, cancellationReason: input.cancellationReason.trim() },
        $inc: { version: 1 },
      },
      { returnDocument: 'after', runValidators: true, session }
    ).lean<VivaSessionRecord | null>();
    if (!cancelledSession) {
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'Another administrator changed this Viva session. Reload before cancelling it.',
      };
    }

    await VivaParticipantLock.deleteMany({ sessionId: input.sessionId }, { session });

    await recordVivaAuditEvent(
      {
        roundId: String(cancelledSession.roundId),
        sessionId: input.sessionId,
        event: 'session-cancelled',
        actorId: actor.id,
        actorRole: 'admin',
        actorName: actor.name,
        actorRollNo: actor.rollNo,
        occurredAt: cancelledAt,
      },
      session
    );

    const schedule = toScheduleDto(cancelledSession);
    if (!schedule) throw new Error('Cancelled Viva session could not be serialized.');
    return { success: true, schedule };
  });
}

export async function scheduleVivaSession(
  input: VivaScheduleInput,
  actor: VivaScheduleActor
): Promise<VivaScheduleSaveResult> {
  try {
    return await withVivaTransaction(async (session) => {
      const validation = await validateSchedule(input, session);
      if (!validation.success) return { success: false, reason: 'invalid', error: validation.error };
      if (!await reserveScheduleChange(validation.context, session)) {
        return { success: false, reason: 'concurrent-change', error: 'Another administrator changed this schedule. Reload before saving.' };
      }

      const vivaSession = new VivaSession({
        roundId: input.roundId,
        panelId: input.panelId,
        projectId: input.projectId,
        scheduledAt: input.scheduledAt,
        vivaEndsAt: validation.context.vivaEndsAt,
        locationLabel: input.locationLabel,
      });
      await vivaSession.save({ session });
      await writeScheduleAudit(input.roundId, vivaSession._id, actor, session);

      const schedule = toScheduleDto(vivaSession.toObject());
      if (!schedule) throw new Error('Scheduled Viva session could not be serialized.');
      return { success: true, schedule };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { success: false, reason: 'concurrent-change', error: 'This team was scheduled by another administrator. Reload and try again.' };
    }
    throw error;
  }
}

export async function rescheduleVivaSession(
  sessionId: string,
  version: number,
  input: VivaScheduleInput,
  actor: VivaScheduleActor
): Promise<VivaScheduleSaveResult> {
  try {
    return await withVivaTransaction(async (session) => {
      const existing = await VivaSession.findById(sessionId)
        .select('_id roundId startedAt completedAt cancelledAt version')
        .session(session)
        .lean<VivaSessionRecord | null>();
      if (!existing) {
        return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
      }
      if (String(existing.roundId) !== input.roundId) {
        return { success: false, reason: 'invalid', error: 'A Viva session cannot be moved to a different round.' };
      }
      if (isTerminal(existing)) {
        return { success: false, reason: 'not-reschedulable', error: 'Only unstarted Viva sessions can be rescheduled.' };
      }
      if (asVersion(existing.version) !== version) {
        return { success: false, reason: 'concurrent-change', error: 'Another administrator changed this schedule. Reload before saving.' };
      }

      const validation = await validateSchedule(input, session, sessionId);
      if (!validation.success) return { success: false, reason: 'invalid', error: validation.error };
      if (!await reserveScheduleChange(validation.context, session)) {
        return { success: false, reason: 'concurrent-change', error: 'Another administrator changed this schedule. Reload before saving.' };
      }

      const write = await VivaSession.updateOne(
        { _id: sessionId, version, startedAt: null, completedAt: null, cancelledAt: null },
        {
          $set: {
            panelId: input.panelId,
            projectId: input.projectId,
            scheduledAt: input.scheduledAt,
            vivaEndsAt: validation.context.vivaEndsAt,
            locationLabel: input.locationLabel,
          },
          $inc: { version: 1 },
        },
        { session }
      );
      if (write.modifiedCount !== 1) {
        return { success: false, reason: 'concurrent-change', error: 'Another administrator changed this schedule. Reload before saving.' };
      }

      const updated = await VivaSession.findById(sessionId)
        .select('_id roundId panelId projectId scheduledAt vivaEndsAt locationLabel version')
        .session(session)
        .lean<VivaSessionRecord | null>();
      const schedule = updated ? toScheduleDto(updated) : null;
      if (!schedule) throw new Error('Rescheduled Viva session could not be serialized.');

      await writeScheduleAudit(input.roundId, sessionId, actor, session);
      return { success: true, schedule };
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return { success: false, reason: 'concurrent-change', error: 'This team was scheduled by another administrator. Reload and try again.' };
    }
    throw error;
  }
}
