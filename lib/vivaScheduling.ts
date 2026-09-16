import mongoose, { type ClientSession } from 'mongoose';

import Project from '../models/Project';
import User from '../models/User';
import VivaPanel from '../models/VivaPanel';
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
  scheduled: VivaAutomaticScheduleDraft[];
  unplaced: Array<{ projectId: string; reason: string }>;
};

export type VivaAutomaticScheduleSaveInput = {
  roundId: string;
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
};

type VivaPanelRecord = {
  _id: unknown;
  roundId?: unknown;
  examinerIds?: unknown;
  panelAdminId?: unknown;
};

type ProjectRecord = {
  _id: unknown;
  supervisorId?: unknown;
  members?: unknown;
};

type UserRecord = { _id: unknown };

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
  publishedAt?: Date | null;
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
};

type AutomaticScheduleProject = {
  id: string;
  supervisorId: string;
  memberIds: string[];
};

type AutomaticScheduleSlot = {
  scheduledAt: Date;
  vivaEndsAt: Date;
  locationLabel: string;
};

type AutomaticScheduleOption = {
  panel: AutomaticSchedulePanel;
  slot: AutomaticScheduleSlot;
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
  if (!roundId || !panelId || !projectId || !scheduledAt || locationLabel === null) {
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
    return startsAt && endsAt && startsAt < endsAt && locationLabel !== null
      ? [{ startsAt, endsAt, locationLabel }]
      : [];
  }).sort((first, second) => first.startsAt.getTime() - second.startsAt.getTime());
  if (availability.length !== value.availability.length) {
    return { success: false, error: 'Each Viva availability window needs valid start and end times.' };
  }
  if (availability.some((window, index) => index > 0 && window.startsAt < availability[index - 1].endsAt)) {
    return { success: false, error: 'Viva availability windows cannot overlap.' };
  }

  return { success: true, input: { roundId, availability } };
}

export function parseVivaAutomaticScheduleSaveInput(value: unknown):
  | { success: true; input: VivaAutomaticScheduleSaveInput }
  | { success: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value.schedules)) {
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

  return { success: true, input: { roundId, schedules } };
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

async function readScheduleContext(
  input: VivaScheduleInput,
  session: ClientSession
): Promise<{ success: true; context: ScheduleContext } | { success: false; error: string }> {
  const [round, panel, project] = await Promise.all([
    VivaRound.findById(input.roundId)
      .select('_id projectIds targetPanelSize minimumPanelSize vivaDurationMinutes scheduleRevision')
      .session(session)
      .lean<VivaRoundRecord | null>(),
    VivaPanel.findById(input.panelId)
      .select('_id roundId examinerIds panelAdminId')
      .session(session)
      .lean<VivaPanelRecord | null>(),
    Project.findById(input.projectId)
      .select('_id supervisorId members')
      .session(session)
      .lean<ProjectRecord | null>(),
  ]);

  if (!round || !panel || !project) {
    return { success: false, error: 'The selected Viva round, team, or panel no longer exists.' };
  }
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
  if (
    !Number.isSafeInteger(targetPanelSize)
    || !Number.isSafeInteger(minimumPanelSize)
    || !Number.isFinite(vivaDurationMinutes)
    || vivaDurationMinutes <= 0
    || panelExaminerIds.length < minimumPanelSize
    || panelExaminerIds.length > targetPanelSize
    || !isVivaPanelAdmin(panelExaminerIds, String(panel.panelAdminId || ''))
  ) {
    return { success: false, error: 'The selected panel cannot conduct a Viva session.' };
  }

  const activePanelMembers = await User.find({
    _id: { $in: panelExaminerIds },
    role: 'supervisor',
    isActive: true,
  })
    .select('_id')
    .session(session)
    .lean<UserRecord[]>();
  if (activePanelMembers.length !== panelExaminerIds.length) {
    return { success: false, error: 'One or more selected panel teachers are no longer active.' };
  }

  const projectMemberIds = asIdList(project.members);
  const activeProjectMembers = projectMemberIds.length > 0
    ? await User.find({ _id: { $in: projectMemberIds }, role: 'student', isActive: true })
        .select('_id')
        .session(session)
        .lean<UserRecord[]>()
    : [];
  if (activeProjectMembers.length === 0) {
    return { success: false, error: 'The selected team has no active students.' };
  }
  if (panelExaminerIds.includes(String(project.supervisorId || ''))) {
    return { success: false, error: 'A team cannot be examined by its own supervisor.' };
  }

  return {
    success: true,
    context: {
      round,
      panel,
      project,
      panelExaminerIds,
      projectMemberIds,
      vivaEndsAt: new Date(input.scheduledAt.getTime() + vivaDurationMinutes * 60_000),
    },
  };
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

async function findScheduleConflict(
  input: VivaScheduleInput,
  context: ScheduleContext,
  session: ClientSession,
  excludedSessionId?: string
): Promise<string | null> {
  const candidates = await VivaSession.find({
    ...(excludedSessionId ? { _id: { $ne: excludedSessionId } } : {}),
    cancelledAt: null,
    completedAt: null,
    scheduledAt: { $lt: context.vivaEndsAt },
    vivaEndsAt: { $gt: input.scheduledAt },
  })
    .select('_id panelId projectId scheduledAt vivaEndsAt')
    .session(session)
    .lean<VivaSessionRecord[]>();
  if (candidates.length === 0) return null;

  const [panels, projects] = await Promise.all([
    VivaPanel.find({ _id: { $in: candidates.map((candidate) => candidate.panelId) } })
      .select('_id examinerIds')
      .session(session)
      .lean<VivaPanelRecord[]>(),
    Project.find({ _id: { $in: candidates.map((candidate) => candidate.projectId) } })
      .select('_id members')
      .session(session)
      .lean<ProjectRecord[]>(),
  ]);
  const panelMembersById = new Map(
    panels.map((panel) => [String(panel._id), asIdList(panel.examinerIds)])
  );
  const projectMembersById = new Map(
    projects.map((project) => [String(project._id), asIdList(project.members)])
  );

  const reservations: ScheduleReservation[] = [];
  for (const candidate of candidates) {
    const panelMembers = panelMembersById.get(String(candidate.panelId));
    const projectMembers = projectMembersById.get(String(candidate.projectId));
    if (
      !panelMembers
      || !projectMembers
      || !(candidate.scheduledAt instanceof Date)
      || !(candidate.vivaEndsAt instanceof Date)
    ) {
      return 'An existing Viva schedule has incomplete resources. Resolve it before scheduling another session.';
    }
    reservations.push({
      scheduledAt: candidate.scheduledAt,
      vivaEndsAt: candidate.vivaEndsAt,
      panelExaminerIds: panelMembers,
      projectMemberIds: projectMembers,
    });
  }

  return findReservationConflict(reservationFromScheduleContext(input, context), reservations);
}

async function hasExistingAttempt(
  input: VivaScheduleInput,
  session: ClientSession,
  excludedSessionId?: string
): Promise<boolean> {
  return Boolean(await VivaSession.exists({
    roundId: input.roundId,
    projectId: input.projectId,
    cancelledAt: null,
    ...(excludedSessionId ? { _id: { $ne: excludedSessionId } } : {}),
  }).session(session));
}

async function validateSchedule(
  input: VivaScheduleInput,
  session: ClientSession,
  excludedSessionId?: string
): Promise<{ success: true; context: ScheduleContext } | { success: false; error: string }> {
  if (await hasExistingAttempt(input, session, excludedSessionId)) {
    return { success: false, error: 'This team already has a Viva attempt in the selected round.' };
  }

  const context = await readScheduleContext(input, session);
  if (!context.success) return context;

  const conflictError = await findScheduleConflict(input, context.context, session, excludedSessionId);
  return conflictError ? { success: false, error: conflictError } : context;
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
  availability: readonly VivaScheduleAvailabilityInput[],
  vivaDurationMinutes: number
): AutomaticScheduleSlot[] {
  const durationMilliseconds = vivaDurationMinutes * 60_000;
  const slots: AutomaticScheduleSlot[] = [];

  for (const window of availability) {
    for (
      let startsAt = new Date(window.startsAt);
      startsAt.getTime() + durationMilliseconds <= window.endsAt.getTime();
      startsAt = new Date(startsAt.getTime() + durationMilliseconds)
    ) {
      slots.push({
        scheduledAt: startsAt,
        vivaEndsAt: new Date(startsAt.getTime() + durationMilliseconds),
        locationLabel: window.locationLabel,
      });
      if (slots.length > MAX_AUTOMATIC_SCHEDULE_SLOTS) return [];
    }
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

function automaticScheduleOptions(
  project: AutomaticScheduleProject,
  panels: readonly AutomaticSchedulePanel[],
  slots: readonly AutomaticScheduleSlot[],
  reservations: readonly ScheduleReservation[],
  panelWorkloads: ReadonlyMap<string, number>
): AutomaticScheduleOption[] {
  return panels.flatMap((panel) => {
    if (panel.examinerIds.includes(project.supervisorId)) return [];

    return slots.flatMap((slot) => {
      const conflict = findReservationConflict(
        {
          scheduledAt: slot.scheduledAt,
          vivaEndsAt: slot.vivaEndsAt,
          panelExaminerIds: panel.examinerIds,
          projectMemberIds: project.memberIds,
        },
        reservations
      );
      return conflict ? [] : [{ panel, slot }];
    });
  }).sort((first, second) => (
    first.slot.scheduledAt.getTime() - second.slot.scheduledAt.getTime()
    || (panelWorkloads.get(first.panel.id) || 0) - (panelWorkloads.get(second.panel.id) || 0)
    || first.panel.id.localeCompare(second.panel.id)
  ));
}

export async function previewAutomaticVivaSchedule(
  input: VivaAutomaticScheduleInput
): Promise<VivaAutomaticSchedulePreviewResult> {
  const round = await VivaRound.findById(input.roundId)
    .select('_id projectIds targetPanelSize minimumPanelSize vivaDurationMinutes')
    .lean<VivaRoundRecord | null>();
  if (!round) {
    return { success: false, reason: 'not-found', error: 'This Viva round no longer exists.' };
  }

  const vivaDurationMinutes = Number(round.vivaDurationMinutes);
  if (!Number.isFinite(vivaDurationMinutes) || vivaDurationMinutes <= 0) {
    return { success: false, reason: 'invalid', error: 'This Viva round has an invalid session duration.' };
  }
  const slots = availabilitySlots(input.availability, vivaDurationMinutes);
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
    VivaPanel.find({ roundId: input.roundId }).select('_id examinerIds panelAdminId').lean<VivaPanelRecord[]>(),
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
    return [{ id: panelId, examinerIds }];
  });
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
    const supervisorId = project ? String(project.supervisorId || '') : '';
    if (!project || !mongoose.Types.ObjectId.isValid(supervisorId)) {
      unplaced.push({ projectId, reason: 'This selected team is no longer available.' });
      continue;
    }
    if (!memberIds.some((memberId) => activeStudentIds.has(memberId))) {
      unplaced.push({ projectId, reason: 'This team has no active students.' });
      continue;
    }
    if (validPanels.length === 0) {
      unplaced.push({ projectId, reason: 'No valid Viva panel is available.' });
      continue;
    }
    if (validPanels.every((panel) => panel.examinerIds.includes(supervisorId))) {
      unplaced.push({ projectId, reason: 'The team supervisor belongs to every available panel.' });
      continue;
    }

    schedulableProjects.push({ id: projectId, supervisorId, memberIds });
  }

  const orderedProjects = schedulableProjects.map((project) => ({
    project,
    options: automaticScheduleOptions(
      project,
      validPanels,
      slots,
      existingReservations.reservations,
      panelWorkloads
    ),
  })).sort((first, second) => (
    first.options.length - second.options.length || first.project.id.localeCompare(second.project.id)
  ));
  const reservations = [...existingReservations.reservations];
  const scheduled: VivaAutomaticScheduleDraft[] = [];

  for (const { project } of orderedProjects) {
    const option = automaticScheduleOptions(project, validPanels, slots, reservations, panelWorkloads)[0];
    if (!option) {
      unplaced.push({ projectId: project.id, reason: 'No available Viva slot remains after constrained teams were placed.' });
      continue;
    }

    scheduled.push({
      projectId: project.id,
      panelId: option.panel.id,
      scheduledAt: option.slot.scheduledAt.toISOString(),
      vivaEndsAt: option.slot.vivaEndsAt.toISOString(),
      locationLabel: option.slot.locationLabel,
    });
    reservations.push({
      scheduledAt: option.slot.scheduledAt,
      vivaEndsAt: option.slot.vivaEndsAt,
      panelExaminerIds: option.panel.examinerIds,
      projectMemberIds: project.memberIds,
    });
    panelWorkloads.set(option.panel.id, (panelWorkloads.get(option.panel.id) || 0) + 1);
  }

  return { success: true, draft: { scheduled, unplaced } };
}

export async function applyAutomaticVivaSchedule(
  input: VivaAutomaticScheduleSaveInput,
  actor: VivaScheduleActor
): Promise<VivaAutomaticScheduleSaveResult> {
  try {
    return await withVivaTransaction(async (session) => {
      const contexts: ScheduleContext[] = [];
      const draftReservations: ScheduleReservation[] = [];

      for (const scheduleInput of input.schedules) {
        const validation = await validateSchedule(scheduleInput, session);
        if (!validation.success) {
          return { success: false, reason: 'invalid', error: validation.error };
        }

        const reservation = reservationFromScheduleContext(scheduleInput, validation.context);
        const conflict = findReservationConflict(reservation, draftReservations);
        if (conflict) return { success: false, reason: 'invalid', error: conflict };

        contexts.push(validation.context);
        draftReservations.push(reservation);
      }

      if (!await reserveScheduleChange(contexts[0], session)) {
        return {
          success: false,
          reason: 'concurrent-change',
          error: 'Another administrator changed this schedule. Generate a fresh draft before saving.',
        };
      }

      const schedules: VivaScheduleDto[] = [];
      for (let index = 0; index < input.schedules.length; index += 1) {
        const scheduleInput = input.schedules[index];
        const vivaSession = new VivaSession({
          roundId: input.roundId,
          panelId: scheduleInput.panelId,
          projectId: scheduleInput.projectId,
          scheduledAt: scheduleInput.scheduledAt,
          vivaEndsAt: contexts[index].vivaEndsAt,
          locationLabel: scheduleInput.locationLabel,
        });
        await vivaSession.save({ session });
        await writeScheduleAudit(input.roundId, vivaSession._id, actor, session);

        const schedule = toScheduleDto(vivaSession.toObject());
        if (!schedule) throw new Error('Automatic Viva schedule could not be serialized.');
        schedules.push(schedule);
      }

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
      .select('_id roundId scheduledAt startedAt completedAt cancelledAt publishedAt version')
      .session(session)
      .lean<VivaSessionRecord | null>();
    if (!existing) {
      return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
    }
    if (existing.publishedAt instanceof Date) {
      return { success: false, reason: 'not-cancellable', error: 'A published Viva result cannot be cancelled.' };
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
        publishedAt: null,
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
