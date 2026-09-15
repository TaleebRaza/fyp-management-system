import mongoose, { type ClientSession } from 'mongoose';

import Project from '../models/Project';
import User from '../models/User';
import VivaPanel from '../models/VivaPanel';
import VivaRound from '../models/VivaRound';
import VivaSession from '../models/VivaSession';
import { isVivaPanelAdmin } from './viva';
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

export type VivaScheduleSaveResult =
  | { success: true; schedule: VivaScheduleDto }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'not-reschedulable' | 'concurrent-change';
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
    .select('_id panelId projectId')
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

  for (const candidate of candidates) {
    const panelMembers = panelMembersById.get(String(candidate.panelId));
    const projectMembers = projectMembersById.get(String(candidate.projectId));
    if (!panelMembers || !projectMembers) {
      return 'An existing Viva schedule has incomplete resources. Resolve it before scheduling another session.';
    }
    if (hasOverlap(context.panelExaminerIds, panelMembers)) {
      return 'A selected panel teacher is already booked during this time.';
    }
    if (hasOverlap(context.projectMemberIds, projectMembers)) {
      return 'A selected team member is already booked during this time.';
    }
  }

  return null;
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

export async function getVivaSchedules(): Promise<VivaScheduleDto[]> {
  const sessions = await VivaSession.find({ scheduledAt: { $type: 'date' } })
    .select('_id roundId panelId projectId scheduledAt vivaEndsAt locationLabel version')
    .sort({ scheduledAt: 1, _id: 1 })
    .lean<VivaSessionRecord[]>();

  return sessions.flatMap((session) => {
    const schedule = toScheduleDto(session);
    return schedule ? [schedule] : [];
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
