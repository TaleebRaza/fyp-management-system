import mongoose, { type ClientSession } from 'mongoose';

import Project from '../models/Project';
import User from '../models/User';
import VivaPanel from '../models/VivaPanel';
import VivaParticipantLock from '../models/VivaParticipantLock';
import VivaRound from '../models/VivaRound';
import VivaSession from '../models/VivaSession';
import {
  calculateVivaPhase,
  getVivaGradeChangePermission,
  getVivaGradeResult,
  isVivaPanelAdmin,
  validateVivaConfiguration,
  VIVA_GRADE_SCALE,
  type VivaGradeResult,
} from './viva';
import { recordVivaAuditEvent, withVivaTransaction } from './vivaPersistence';

export type VivaPersonDto = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaGradeDto = {
  grade: string;
  percentage: number;
};

export type VivaSessionWorkspaceDto = {
  id: string;
  phase: 'scheduled' | 'running' | 'completed';
  canManage: boolean;
  version: number;
  gradeScale: VivaGradeDto[];
  result: VivaGradeDto | null;
  scheduledAt: string;
  startedAt: string | null;
  vivaEndsAt: string;
  locationLabel: string;
  round: {
    name: string;
    vivaDurationMinutes: number;
  };
  project: {
    id: string;
    title: string;
    description: string;
    domains: string[];
    tools: string;
    members: VivaPersonDto[];
    supervisor: VivaPersonDto | null;
  };
  panel: {
    id: string;
    admin: VivaPersonDto;
    members: VivaPersonDto[];
  };
};

export type VivaSessionActor = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaSessionStartResult =
  | { success: true; workspace: VivaSessionWorkspaceDto; started: boolean }
  | {
      success: false;
      reason: 'not-found' | 'forbidden' | 'not-startable' | 'invalid' | 'concurrent-change';
      error: string;
    };

type VivaSessionMutationFailure = {
  success: false;
  reason: 'not-found' | 'forbidden' | 'not-startable' | 'invalid' | 'concurrent-change';
  error: string;
};

export type VivaGradeSaveResult =
  | { success: true; workspace: VivaSessionWorkspaceDto }
  | VivaSessionMutationFailure;

export type VivaSessionCompletionResult =
  | {
      success: true;
      result: VivaGradeResult;
      completedAt: string;
      workspace: VivaSessionWorkspaceDto;
    }
  | VivaSessionMutationFailure;

export type VivaSessionRequeueResult =
  | { success: true }
  | VivaSessionMutationFailure;

type VivaSessionStartFailure = Extract<VivaSessionStartResult, { success: false }>;

class VivaStartAbort extends Error {
  constructor(readonly result: VivaSessionStartFailure) {
    super(result.error);
  }
}

class VivaRequeueAbort extends Error {
  constructor(readonly result: Extract<VivaSessionRequeueResult, { success: false }>) {
    super(result.error);
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return isRecord(error) && error.code === 11000;
}

type VivaRoundRecord = {
  _id: unknown;
  name?: unknown;
  targetPanelSize?: unknown;
  minimumPanelSize?: unknown;
  vivaDurationMinutes?: unknown;
  confirmedAt?: Date | null;
  frozenAt?: Date | null;
  scheduleRevision?: unknown;
};

type VivaPanelRecord = {
  _id: unknown;
  roundId?: unknown;
  examinerIds?: unknown;
  panelAdminId?: unknown;
};

type VivaProjectRecord = {
  _id: unknown;
  supervisorId?: unknown;
  members?: unknown;
  title?: unknown;
  description?: unknown;
  domains?: unknown;
  tools?: unknown;
  pdfUrl?: unknown;
  pdfSize?: unknown;
};

type VivaUserRecord = {
  _id: unknown;
  name?: unknown;
  rollNo?: unknown;
  role?: unknown;
  isActive?: unknown;
};

type VivaSessionRecord = {
  _id: unknown;
  roundId?: unknown;
  panelId?: unknown;
  projectId?: unknown;
  scheduledAt?: Date | null;
  startedAt?: Date | null;
  vivaEndsAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  locationLabel?: unknown;
  result?: {
    grade?: unknown;
    percentage?: unknown;
    selectedAt?: Date | null;
  };
  version?: unknown;
  roundSnapshot?: {
    name?: unknown;
    vivaDurationMinutes?: unknown;
  };
  projectSnapshot?: {
    projectId?: unknown;
    title?: unknown;
    description?: unknown;
    domains?: unknown;
    tools?: unknown;
    pdfUrl?: unknown;
    pdfSize?: unknown;
    members?: unknown;
    supervisor?: unknown;
  };
  panelSnapshot?: {
    panelId?: unknown;
    panelAdmin?: unknown;
    examiners?: unknown;
  };
};

type CurrentContext = {
  round: VivaRoundRecord;
  panel: VivaPanelRecord;
  project: VivaProjectRecord;
  panelMembers: VivaPersonDto[];
  panelAdmin: VivaPersonDto;
  projectMembers: VivaPersonDto[];
  projectSupervisor: VivaPersonDto | null;
};

type CurrentContextResult =
  | { success: true; context: CurrentContext }
  | Extract<VivaSessionStartResult, { success: false }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asId(value: unknown): string | null {
  const id = String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function asIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;

  const ids = value.map(asId);
  return ids.every((id): id is string => Boolean(id)) ? ids : null;
}

function asDate(value: unknown): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

function asIsoDate(value: unknown): string | null {
  return asDate(value)?.toISOString() || null;
}

function sessionPhase(vivaSession: VivaSessionRecord) {
  return calculateVivaPhase({
    startedAt: asDate(vivaSession.startedAt),
    completedAt: asDate(vivaSession.completedAt),
    cancelledAt: asDate(vivaSession.cancelledAt),
  });
}

function asNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function asVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function arePresent<T>(values: readonly (T | null | undefined)[]): values is T[] {
  return values.every((value) => value !== null && value !== undefined);
}

function toPerson(user: VivaUserRecord): VivaPersonDto | null {
  const id = asId(user._id);
  const name = asText(user.name);
  const rollNo = asText(user.rollNo);
  return id && name && rollNo ? { id, name, rollNo } : null;
}

function toSnapshotPerson(value: unknown): VivaPersonDto | null {
  if (!isRecord(value)) return null;

  const id = typeof value.userId === 'string' ? value.userId.trim() : '';
  const name = asText(value.name);
  const rollNo = asText(value.rollNo);
  return id && name && rollNo ? { id, name, rollNo } : null;
}

function snapshotPerson(person: VivaPersonDto) {
  return { userId: person.id, name: person.name, rollNo: person.rollNo };
}

function canonicalSessionResult(value: unknown): VivaGradeResult | null {
  if (!isRecord(value) || !(value.selectedAt instanceof Date)) return null;

  const result = getVivaGradeResult(value.grade);
  return result && value.percentage === result.percentage ? result : null;
}

function workspaceGradeScale(): VivaGradeDto[] {
  return VIVA_GRADE_SCALE.map(({ grade, percentage }) => ({ grade, percentage }));
}

function workspaceFromSnapshot(session: VivaSessionRecord): VivaSessionWorkspaceDto | null {
  const scheduledAt = asIsoDate(session.scheduledAt);
  const startedAt = asIsoDate(session.startedAt);
  const vivaEndsAt = asIsoDate(session.vivaEndsAt);
  const roundSnapshot = session.roundSnapshot;
  const projectSnapshot = session.projectSnapshot;
  const panelSnapshot = session.panelSnapshot;
  if (!scheduledAt || !startedAt || !vivaEndsAt || !roundSnapshot || !projectSnapshot || !panelSnapshot) {
    return null;
  }

  const projectId = typeof projectSnapshot.projectId === 'string' ? projectSnapshot.projectId : '';
  const panelId = typeof panelSnapshot.panelId === 'string' ? panelSnapshot.panelId : '';
  const vivaDurationMinutes = asNonNegativeNumber(roundSnapshot.vivaDurationMinutes);
  const members = Array.isArray(projectSnapshot.members)
    ? projectSnapshot.members.map(toSnapshotPerson)
    : [];
  const panelMembers = Array.isArray(panelSnapshot.examiners)
    ? panelSnapshot.examiners.map(toSnapshotPerson)
    : [];
  const panelAdmin = toSnapshotPerson(panelSnapshot.panelAdmin);
  const supervisor = toSnapshotPerson(projectSnapshot.supervisor);
  const version = asVersion(session.version);
  const phase = sessionPhase(session);
  if (
    !projectId
    || !panelId
    || !asText(roundSnapshot.name)
    || vivaDurationMinutes === null
    || !arePresent(members)
    || !arePresent(panelMembers)
    || members.length === 0
    || panelMembers.length === 0
    || !panelAdmin
    || version === null
    || (phase !== 'running' && phase !== 'completed')
  ) {
    return null;
  }

  const domains = Array.isArray(projectSnapshot.domains)
    ? projectSnapshot.domains.filter((domain): domain is string => typeof domain === 'string')
    : [];
  return {
    id: String(session._id),
    phase,
    canManage: false,
    version,
    gradeScale: workspaceGradeScale(),
    result: canonicalSessionResult(session.result),
    scheduledAt,
    startedAt,
    vivaEndsAt,
    locationLabel: asText(session.locationLabel),
    round: { name: asText(roundSnapshot.name), vivaDurationMinutes },
    project: {
      id: projectId,
      title: asText(projectSnapshot.title),
      description: asText(projectSnapshot.description),
      domains,
      tools: asText(projectSnapshot.tools),
      members,
      supervisor,
    },
    panel: {
      id: panelId,
      admin: panelAdmin,
      members: panelMembers,
    },
  };
}

function workspaceFromCurrentContext(
  vivaSession: VivaSessionRecord,
  context: CurrentContext
): VivaSessionWorkspaceDto | null {
  const scheduledAt = asIsoDate(vivaSession.scheduledAt);
  const vivaEndsAt = asIsoDate(vivaSession.vivaEndsAt);
  const vivaDurationMinutes = asNonNegativeNumber(context.round.vivaDurationMinutes);
  const version = asVersion(vivaSession.version);
  if (!scheduledAt || !vivaEndsAt || vivaDurationMinutes === null || version === null) return null;

  return {
    id: String(vivaSession._id),
    phase: 'scheduled',
    canManage: false,
    version,
    gradeScale: workspaceGradeScale(),
    result: null,
    scheduledAt,
    startedAt: null,
    vivaEndsAt,
    locationLabel: asText(vivaSession.locationLabel),
    round: { name: asText(context.round.name), vivaDurationMinutes },
    project: {
      id: String(context.project._id),
      title: asText(context.project.title),
      description: asText(context.project.description),
      domains: Array.isArray(context.project.domains)
        ? context.project.domains.filter((domain): domain is string => typeof domain === 'string')
        : [],
      tools: asText(context.project.tools),
      members: context.projectMembers,
      supervisor: context.projectSupervisor,
    },
    panel: {
      id: String(context.panel._id),
      admin: context.panelAdmin,
      members: context.panelMembers,
    },
  };
}

function toSessionSnapshots(context: CurrentContext) {
  return {
    roundSnapshot: {
      name: asText(context.round.name),
      targetPanelSize: Number(context.round.targetPanelSize),
      minimumPanelSize: Number(context.round.minimumPanelSize),
      vivaDurationMinutes: Number(context.round.vivaDurationMinutes),
    },
    projectSnapshot: {
      projectId: String(context.project._id),
      title: asText(context.project.title),
      description: asText(context.project.description),
      domains: Array.isArray(context.project.domains)
        ? context.project.domains.filter((domain): domain is string => typeof domain === 'string')
        : [],
      tools: asText(context.project.tools),
      pdfUrl: asText(context.project.pdfUrl),
      pdfSize: asNonNegativeNumber(context.project.pdfSize) || 0,
      members: context.projectMembers.map(snapshotPerson),
      ...(context.projectSupervisor ? { supervisor: snapshotPerson(context.projectSupervisor) } : {}),
    },
    panelSnapshot: {
      panelId: String(context.panel._id),
      panelAdmin: snapshotPerson(context.panelAdmin),
      examiners: context.panelMembers.map(snapshotPerson),
    },
  };
}

function assembleCurrentContext(
  vivaSession: VivaSessionRecord,
  round: VivaRoundRecord | undefined,
  panel: VivaPanelRecord | undefined,
  project: VivaProjectRecord | undefined,
  peopleById: ReadonlyMap<string, VivaUserRecord>,
  actorId?: string
): CurrentContextResult {
  const roundId = asId(vivaSession.roundId);
  const panelId = asId(vivaSession.panelId);
  const projectId = asId(vivaSession.projectId);
  if (!roundId || !panelId || !projectId) {
    return { success: false, reason: 'invalid', error: 'This Viva session has incomplete scheduling data.' };
  }
  if (!round || !panel || !project) {
    return { success: false, reason: 'invalid', error: 'The scheduled Viva round, panel, or team no longer exists.' };
  }
  if (String(round._id) !== roundId || String(panel.roundId) !== roundId || String(panel._id) !== panelId) {
    return { success: false, reason: 'invalid', error: 'This Viva session no longer matches its scheduled panel.' };
  }
  if (String(project._id) !== projectId) {
    return { success: false, reason: 'invalid', error: 'This Viva session no longer matches its scheduled team.' };
  }

  const configuration = validateVivaConfiguration({
    targetPanelSize: round.targetPanelSize,
    minimumPanelSize: round.minimumPanelSize,
    vivaDurationMinutes: round.vivaDurationMinutes,
  });
  const panelMemberIds = asIdList(panel.examinerIds);
  const panelAdminId = asId(panel.panelAdminId);
  const projectMemberIds = asIdList(project.members);
  const projectSupervisorId = asId(project.supervisorId);
  if (
    !configuration.success
    || !panelMemberIds
    || !panelAdminId
    || !projectMemberIds
    || projectMemberIds.length === 0
    || !isVivaPanelAdmin(panelMemberIds, panelAdminId)
    || panelMemberIds.length < configuration.configuration.minimumPanelSize
    || panelMemberIds.length > configuration.configuration.targetPanelSize
  ) {
    return { success: false, reason: 'invalid', error: 'The current Viva panel or team can no longer conduct this session.' };
  }
  if (actorId && panelAdminId !== actorId) {
    return { success: false, reason: 'forbidden', error: 'Only the assigned panel admin can open this Viva session.' };
  }

  const panelUsers = panelMemberIds.map((id) => peopleById.get(id));
  const projectUsers = projectMemberIds.map((id) => peopleById.get(id));
  const panelMembers = panelUsers.map((person) => person && toPerson(person));
  const projectMembers = projectUsers.map((person) => person && toPerson(person));
  if (
    !arePresent(panelMembers)
    || !arePresent(projectMembers)
    || panelUsers.some((person) => person?.role !== 'supervisor' || person.isActive !== true)
    || projectUsers.some((person) => person?.role !== 'student')
  ) {
    return { success: false, reason: 'invalid', error: 'One or more current Viva participants are no longer valid.' };
  }

  const panelAdmin = panelMembers.find((person) => person.id === panelAdminId);
  const supervisorRecord = projectSupervisorId ? peopleById.get(projectSupervisorId) : undefined;
  const projectSupervisor = supervisorRecord?.role === 'supervisor' ? toPerson(supervisorRecord) : null;
  if (!panelAdmin) {
    return { success: false, reason: 'invalid', error: 'The assigned panel admin is no longer a valid panel member.' };
  }

  return {
    success: true,
    context: { round, panel, project, panelMembers, panelAdmin, projectMembers, projectSupervisor },
  };
}

async function readCurrentContext(
  vivaSession: VivaSessionRecord,
  actorId?: string,
  databaseSession?: ClientSession
): Promise<CurrentContextResult> {
  const roundId = asId(vivaSession.roundId);
  const panelId = asId(vivaSession.panelId);
  const projectId = asId(vivaSession.projectId);
  if (!roundId || !panelId || !projectId) {
    return { success: false, reason: 'invalid', error: 'This Viva session has incomplete scheduling data.' };
  }

  const roundQuery = VivaRound.findById(roundId)
    .select('_id name targetPanelSize minimumPanelSize vivaDurationMinutes confirmedAt frozenAt');
  const panelQuery = VivaPanel.findById(panelId).select('_id roundId examinerIds panelAdminId');
  const projectQuery = Project.findById(projectId)
    .select('_id supervisorId members title description domains tools pdfUrl pdfSize');
  if (databaseSession) {
    roundQuery.session(databaseSession);
    panelQuery.session(databaseSession);
    projectQuery.session(databaseSession);
  }
  const [round, panel, project] = await Promise.all([
    roundQuery.lean<VivaRoundRecord | null>(),
    panelQuery.lean<VivaPanelRecord | null>(),
    projectQuery.lean<VivaProjectRecord | null>(),
  ]);
  if (!round || !panel || !project) {
    return { success: false, reason: 'invalid', error: 'The scheduled Viva round, panel, or team no longer exists.' };
  }
  if (!(round.confirmedAt instanceof Date) || !Number.isFinite(round.confirmedAt.getTime())) {
    return { success: false, reason: 'invalid', error: 'This Viva round must be confirmed before sessions can start.' };
  }
  const panelMemberIds = asIdList(panel.examinerIds) || [];
  const projectMemberIds = asIdList(project.members) || [];
  const projectSupervisorId = asId(project.supervisorId);
  const participantIds = [...new Set([
    ...panelMemberIds,
    ...projectMemberIds,
    ...(projectSupervisorId ? [projectSupervisorId] : []),
  ])];
  const peopleQuery = User.find({ _id: { $in: participantIds } })
    .select('_id name rollNo role isActive');
  if (databaseSession) peopleQuery.session(databaseSession);
  const people = await peopleQuery.lean<VivaUserRecord[]>();
  const peopleById = new Map(people.map((person) => [String(person._id), person]));
  return assembleCurrentContext(vivaSession, round, panel, project, peopleById, actorId);
}

async function createParticipantLocks(
  sessionId: string,
  context: CurrentContext,
  databaseSession: ClientSession
): Promise<void> {
  await VivaParticipantLock.insertMany([
    ...context.panelMembers.map((member) => ({
      userId: member.id,
      sessionId,
      participantType: 'examiner',
      restrictPortal: member.id !== context.panelAdmin.id,
    })),
    ...context.projectMembers.map((member) => ({
      userId: member.id,
      sessionId,
      participantType: 'student',
      restrictPortal: true,
    })),
  ], { session: databaseSession });
}

async function readSession(
  sessionId: string,
  databaseSession?: ClientSession
): Promise<VivaSessionRecord | null> {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) return null;

  const query = VivaSession.findById(sessionId)
    .select('roundId panelId projectId scheduledAt startedAt vivaEndsAt completedAt cancelledAt locationLabel result version roundSnapshot projectSnapshot panelSnapshot');
  if (databaseSession) query.session(databaseSession);
  return query.lean<VivaSessionRecord | null>();
}

function snapshotPanelAdminId(vivaSession: VivaSessionRecord): string | null {
  const panelSnapshot = vivaSession.panelSnapshot;
  if (!panelSnapshot || !isRecord(panelSnapshot.panelAdmin)) return null;

  return asId(panelSnapshot.panelAdmin.userId);
}

function gradeWritePermission(
  vivaSession: VivaSessionRecord,
  actor: VivaSessionActor
): VivaSessionMutationFailure | null {
  if (snapshotPanelAdminId(vivaSession) !== actor.id) {
    return {
      success: false,
      reason: 'forbidden',
      error: 'Only the assigned panel admin can grade this Viva session.',
    };
  }

  const phase = sessionPhase(vivaSession);
  if (phase === 'completed') {
    return {
      success: false,
      reason: 'not-startable',
      error: 'This Viva result has already been finalized.',
    };
  }
  if (phase !== 'running') {
    return {
      success: false,
      reason: 'not-startable',
      error: 'This Viva session is not available for grading.',
    };
  }

  return null;
}

export async function saveVivaGrade(
  sessionId: string,
  version: number,
  grade: unknown,
  actor: VivaSessionActor,
  selectedAt = new Date()
): Promise<VivaGradeSaveResult> {
  if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(actor.id)) {
    return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
  }
  if (asVersion(version) === null || !(selectedAt instanceof Date) || !Number.isFinite(selectedAt.getTime())) {
    return { success: false, reason: 'invalid', error: 'The Viva grade request is invalid.' };
  }
  const permission = getVivaGradeChangePermission('running', grade);
  if (!permission.permitted) {
    return { success: false, reason: 'invalid', error: 'Select a valid Viva grade.' };
  }

  return withVivaTransaction(async (databaseSession) => {
    const updatedSession = await VivaSession.findOneAndUpdate(
      {
        _id: sessionId,
        version,
        startedAt: { $type: 'date' },
        completedAt: null,
        cancelledAt: null,
        'panelSnapshot.panelAdmin.userId': actor.id,
      },
      {
        $set: {
          result: { ...permission.result, selectedAt },
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after', runValidators: true, session: databaseSession }
    ).lean<VivaSessionRecord | null>();
    if (!updatedSession) {
      const currentSession = await readSession(sessionId, databaseSession);
      if (!currentSession) {
        return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
      }
      const authorization = gradeWritePermission(currentSession, actor);
      if (authorization) return authorization;
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'Another tab changed this Viva result. Reload before saving.',
      };
    }

    await recordVivaAuditEvent(
      {
        roundId: String(updatedSession.roundId),
        sessionId,
        event: 'grade-recorded',
        actorId: actor.id,
        actorRole: 'supervisor',
        actorName: actor.name,
        actorRollNo: actor.rollNo,
        occurredAt: selectedAt,
      },
      databaseSession
    );

    const workspace = workspaceFromSnapshot(updatedSession);
    if (!workspace) throw new Error('Saved Viva grade could not be serialized.');
    return { success: true, workspace: { ...workspace, canManage: true } };
  });
}

export async function completeVivaSession(
  sessionId: string,
  version: number,
  actor: VivaSessionActor,
  completedAt = new Date()
): Promise<VivaSessionCompletionResult> {
  if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(actor.id)) {
    return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
  }
  if (asVersion(version) === null || !(completedAt instanceof Date) || !Number.isFinite(completedAt.getTime())) {
    return { success: false, reason: 'invalid', error: 'The Viva completion request is invalid.' };
  }

  return withVivaTransaction(async (databaseSession) => {
    const completedSession = await VivaSession.findOneAndUpdate(
      {
        _id: sessionId,
        version,
        startedAt: { $type: 'date' },
        completedAt: null,
        cancelledAt: null,
        'result.selectedAt': { $type: 'date' },
        'panelSnapshot.panelAdmin.userId': actor.id,
      },
      {
        $set: { completedAt },
        $inc: { version: 1 },
      },
      { returnDocument: 'after', runValidators: true, session: databaseSession }
    ).lean<VivaSessionRecord | null>();
    if (!completedSession) {
      const currentSession = await readSession(sessionId, databaseSession);
      if (!currentSession) {
        return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
      }
      const authorization = gradeWritePermission(currentSession, actor);
      if (authorization) return authorization;
      if (!canonicalSessionResult(currentSession.result)) {
        return {
          success: false,
          reason: 'invalid',
          error: 'Save a valid Viva grade before completing this session.',
        };
      }
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'Another tab changed this Viva session. Reload before completing it.',
      };
    }

    const result = canonicalSessionResult(completedSession.result);
    if (!result) throw new Error('Completed Viva result is invalid.');

    await VivaParticipantLock.deleteMany({ sessionId }, { session: databaseSession });

    await recordVivaAuditEvent(
      {
        roundId: String(completedSession.roundId),
        sessionId,
        event: 'session-finalized',
        actorId: actor.id,
        actorRole: 'supervisor',
        actorName: actor.name,
        actorRollNo: actor.rollNo,
        occurredAt: completedAt,
      },
      databaseSession
    );

    const workspace = workspaceFromSnapshot(completedSession);
    if (!workspace) throw new Error('Completed Viva session could not be serialized.');
    return {
      success: true,
      result,
      completedAt: completedAt.toISOString(),
      workspace: { ...workspace, canManage: true },
    };
  });
}

function idsOverlap(first: readonly string[], second: readonly string[]): boolean {
  const firstIds = new Set(first);
  return second.some((id) => firstIds.has(id));
}

export async function requeueVivaSession(
  sessionId: string,
  version: number,
  actor: VivaSessionActor,
  occurredAt = new Date()
): Promise<VivaSessionRequeueResult> {
  if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(actor.id)) {
    return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
  }
  if (asVersion(version) === null || !(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
    return { success: false, reason: 'invalid', error: 'The Viva requeue request is invalid.' };
  }

  try {
    return await withVivaTransaction(async (databaseSession) => {
      const active = await readSession(sessionId, databaseSession);
      if (!active) return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
      if (snapshotPanelAdminId(active) !== actor.id) {
        return { success: false, reason: 'forbidden', error: 'Only the assigned panel admin can requeue this Viva session.' };
      }
      if (sessionPhase(active) !== 'running') {
        return { success: false, reason: 'not-startable', error: 'Only a running Viva session can be requeued.' };
      }
      if (isRecord(active.result)) {
        return { success: false, reason: 'not-startable', error: 'A session with a saved grade cannot be requeued.' };
      }
      if (asVersion(active.version) !== version) {
        return { success: false, reason: 'concurrent-change', error: 'Another tab changed this Viva session. Reload before requeueing it.' };
      }

      const activeId = String(active._id);
      const roundId = asId(active.roundId);
      const panelId = asId(active.panelId);
      const scheduledAt = asDate(active.scheduledAt);
      if (!roundId || !panelId || !asId(active.projectId) || !scheduledAt) {
        return { success: false, reason: 'invalid', error: 'This active Viva session has incomplete scheduling data.' };
      }
      const round = await VivaRound.findById(roundId)
        .select('_id vivaDurationMinutes scheduleRevision')
        .session(databaseSession)
        .lean<VivaRoundRecord | null>();
      const panel = await VivaPanel.findById(panelId)
        .select('_id examinerIds')
        .session(databaseSession)
        .lean<VivaPanelRecord | null>();
      const durationMinutes = Number(round?.vivaDurationMinutes);
      const panelExaminerIds = panel ? asIdList(panel.examinerIds) : null;
      if (!round || !panelExaminerIds || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        return { success: false, reason: 'invalid', error: 'This Viva round or panel can no longer be requeued safely.' };
      }

      const laterSessions = await VivaSession.find({
        _id: { $ne: active._id },
        roundId,
        panelId,
        scheduledAt: { $gt: scheduledAt },
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
      })
        .select('_id roundId panelId projectId scheduledAt vivaEndsAt startedAt completedAt cancelledAt version')
        .sort({ scheduledAt: 1, _id: 1 })
        .session(databaseSession)
        .lean<VivaSessionRecord[]>();
      if (laterSessions.some((candidate) => !(candidate.scheduledAt instanceof Date) || asVersion(candidate.version) === null)) {
        return { success: false, reason: 'invalid', error: 'A later Viva session has incomplete scheduling data.' };
      }

      const affected = [active, ...laterSessions];
      const slotStarts = affected.map((candidate) => asDate(candidate.scheduledAt));
      if (!slotStarts.every((value): value is Date => Boolean(value))) {
        return { success: false, reason: 'invalid', error: 'The Viva queue has incomplete scheduling data.' };
      }
      const durationMs = durationMinutes * 60_000;
      const proposed = affected.map((record, index) => {
        const targetStart = index === 0 ? slotStarts[slotStarts.length - 1] : slotStarts[index - 1];
        return { record, scheduledAt: targetStart, vivaEndsAt: new Date(targetStart.getTime() + durationMs) };
      });

      const projects = await Project.find({ _id: { $in: affected.map((candidate) => candidate.projectId) } })
        .select('_id members')
        .session(databaseSession)
        .lean<VivaProjectRecord[]>();
      const projectMembersById = new Map(projects.map((project) => [String(project._id), asIdList(project.members) || []]));
      if (affected.some((candidate) => !projectMembersById.has(String(candidate.projectId)))) {
        return { success: false, reason: 'invalid', error: 'A queued Viva team no longer exists.' };
      }

      const rangeStart = new Date(Math.min(...proposed.map((candidate) => candidate.scheduledAt.getTime())));
      const rangeEnd = new Date(Math.max(...proposed.map((candidate) => candidate.vivaEndsAt.getTime())));
      const externalSessions = await VivaSession.find({
        _id: { $nin: affected.map((candidate) => candidate._id) },
        cancelledAt: null,
        completedAt: null,
        scheduledAt: { $lt: rangeEnd },
        vivaEndsAt: { $gt: rangeStart },
      })
        .select('_id panelId projectId scheduledAt vivaEndsAt')
        .session(databaseSession)
        .lean<VivaSessionRecord[]>();
      const externalPanels = await VivaPanel.find({ _id: { $in: externalSessions.map((candidate) => candidate.panelId) } })
        .select('_id examinerIds')
        .session(databaseSession)
        .lean<VivaPanelRecord[]>();
      const externalProjects = await Project.find({ _id: { $in: externalSessions.map((candidate) => candidate.projectId) } })
        .select('_id members')
        .session(databaseSession)
        .lean<VivaProjectRecord[]>();
      const externalPanelMembers = new Map(externalPanels.map((candidate) => [String(candidate._id), asIdList(candidate.examinerIds) || []]));
      const externalProjectMembers = new Map(externalProjects.map((candidate) => [String(candidate._id), asIdList(candidate.members) || []]));

      for (const candidate of proposed) {
        const memberIds = projectMembersById.get(String(candidate.record.projectId)) || [];
        for (const external of externalSessions) {
          const externalStart = asDate(external.scheduledAt);
          const externalEnd = asDate(external.vivaEndsAt);
          const externalExaminerIds = externalPanelMembers.get(String(external.panelId));
          const externalMemberIds = externalProjectMembers.get(String(external.projectId));
          if (!externalStart || !externalEnd || !externalExaminerIds || !externalMemberIds) {
            return { success: false, reason: 'invalid', error: 'An existing Viva schedule has incomplete resources.' };
          }
          if (externalStart >= candidate.vivaEndsAt || externalEnd <= candidate.scheduledAt) continue;
          if (idsOverlap(panelExaminerIds, externalExaminerIds) || idsOverlap(memberIds, externalMemberIds)) {
            return { success: false, reason: 'invalid', error: 'Requeueing would conflict with another Viva session.' };
          }
        }
      }

      const scheduleRevision = asVersion(round.scheduleRevision) || 0;
      const revisionFilter = scheduleRevision === 0
        ? { $or: [{ scheduleRevision: 0 }, { scheduleRevision: { $exists: false } }] }
        : { scheduleRevision };
      const reservedRound = await VivaRound.updateOne(
        { _id: roundId, ...revisionFilter },
        { $inc: { scheduleRevision: 1 } },
        { session: databaseSession }
      );
      if (reservedRound.modifiedCount !== 1) {
        return { success: false, reason: 'concurrent-change', error: 'Another administrator changed this schedule. Reload before requeueing.' };
      }

      const write = await VivaSession.bulkWrite(proposed.map((candidate) => {
        const isActive = String(candidate.record._id) === activeId;
        return {
          updateOne: {
            filter: {
              _id: candidate.record._id,
              version: isActive ? version : candidate.record.version,
              ...(isActive
                ? { startedAt: { $type: 'date' }, completedAt: null, cancelledAt: null, result: { $exists: false } }
                : { startedAt: null, completedAt: null, cancelledAt: null }),
            },
            update: {
              $set: {
                scheduledAt: candidate.scheduledAt,
                vivaEndsAt: candidate.vivaEndsAt,
                ...(isActive ? { startedAt: null } : {}),
              },
              ...(isActive ? { $unset: { roundSnapshot: 1, projectSnapshot: 1, panelSnapshot: 1 } } : {}),
              $inc: { version: 1 },
            },
          },
        };
      }), { session: databaseSession, ordered: true });
      if (write.modifiedCount !== affected.length) {
        throw new VivaRequeueAbort({
          success: false,
          reason: 'concurrent-change',
          error: 'Another user changed this Viva queue. Reload before requeueing.',
        });
      }

      await VivaParticipantLock.deleteMany({ sessionId }, { session: databaseSession });
      await recordVivaAuditEvent({
        roundId,
        sessionId,
        event: 'session-requeued',
        actorId: actor.id,
        actorRole: 'supervisor',
        actorName: actor.name,
        actorRollNo: actor.rollNo,
        occurredAt,
      }, databaseSession);
      return { success: true };
    });
  } catch (error) {
    if (error instanceof VivaRequeueAbort) return error.result;
    throw error;
  }
}

export async function getVivaPanelSessions(actorId: string): Promise<VivaSessionWorkspaceDto[]> {
  if (!mongoose.Types.ObjectId.isValid(actorId)) return [];

  const panels = await VivaPanel.find({ examinerIds: actorId })
    .select('_id roundId examinerIds panelAdminId')
    .lean<VivaPanelRecord[]>();
  if (panels.length === 0) return [];

  const sessions = await VivaSession.find({
    panelId: { $in: panels.map((panel) => panel._id) },
    cancelledAt: null,
  })
    .select('roundId panelId projectId scheduledAt startedAt vivaEndsAt completedAt cancelledAt locationLabel result version roundSnapshot projectSnapshot panelSnapshot')
    .sort({ scheduledAt: 1, _id: 1 })
    .lean<VivaSessionRecord[]>();
  if (sessions.length === 0) return [];

  const scheduledSessions = sessions.filter((vivaSession) => sessionPhase(vivaSession) === 'scheduled');
  const scheduledPanelIds = new Set(scheduledSessions.map((session) => String(session.panelId)));
  const roundIds = [...new Set(scheduledSessions.flatMap((session) => asId(session.roundId) || []))];
  const projectIds = [...new Set(scheduledSessions.flatMap((session) => asId(session.projectId) || []))];
  const [rounds, projects] = await Promise.all([
    roundIds.length === 0
      ? []
      : VivaRound.find({ _id: { $in: roundIds } })
        .select('_id name targetPanelSize minimumPanelSize vivaDurationMinutes frozenAt')
        .lean<VivaRoundRecord[]>(),
    projectIds.length === 0
      ? []
      : Project.find({ _id: { $in: projectIds } })
        .select('_id supervisorId members title description domains tools pdfUrl pdfSize')
        .lean<VivaProjectRecord[]>(),
  ]);
  const panelsById = new Map(panels.map((panel) => [String(panel._id), panel]));
  const roundsById = new Map(rounds.map((round) => [String(round._id), round]));
  const projectsById = new Map(projects.map((project) => [String(project._id), project]));
  const participantIds = [...new Set([
    ...panels
      .filter((panel) => scheduledPanelIds.has(String(panel._id)))
      .flatMap((panel) => asIdList(panel.examinerIds) || []),
    ...projects.flatMap((project) => asIdList(project.members) || []),
    ...projects.flatMap((project) => asId(project.supervisorId) || []),
  ])];
  const people = participantIds.length === 0
    ? []
    : await User.find({ _id: { $in: participantIds } })
      .select('_id name rollNo role isActive')
      .lean<VivaUserRecord[]>();
  const peopleById = new Map(people.map((person) => [String(person._id), person]));

  const workspaces = sessions.map((vivaSession) => {
    const phase = sessionPhase(vivaSession);
    if (phase === 'running' || phase === 'completed') {
      const workspace = workspaceFromSnapshot(vivaSession);
      return workspace ? { ...workspace, canManage: workspace.panel.admin.id === actorId } : null;
    }
    if (phase !== 'scheduled') return null;

    const context = assembleCurrentContext(
      vivaSession,
      roundsById.get(String(vivaSession.roundId)),
      panelsById.get(String(vivaSession.panelId)),
      projectsById.get(String(vivaSession.projectId)),
      peopleById
    );
    if (!context.success) return null;
    const workspace = workspaceFromCurrentContext(vivaSession, context.context);
    return workspace ? { ...workspace, canManage: workspace.panel.admin.id === actorId } : null;
  });

  return workspaces.filter((workspace): workspace is VivaSessionWorkspaceDto => Boolean(workspace));
}

export const getPanelAdminVivaSessions = getVivaPanelSessions;

export async function startVivaSession(
  sessionId: string,
  actor: VivaSessionActor,
  startedAt = new Date()
): Promise<VivaSessionStartResult> {
  if (!mongoose.Types.ObjectId.isValid(sessionId) || !mongoose.Types.ObjectId.isValid(actor.id)) {
    return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
  }
  if (!(startedAt instanceof Date) || !Number.isFinite(startedAt.getTime())) {
    return { success: false, reason: 'invalid', error: 'The Viva session could not be started at this time.' };
  }

  try {
    return await withVivaTransaction(async (databaseSession) => {
      const vivaSession = await readSession(sessionId, databaseSession);
      if (!vivaSession) {
        return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
      }

      const phase = sessionPhase(vivaSession);
      if (phase === 'completed' || phase === 'cancelled') {
        return { success: false, reason: 'not-startable', error: 'This Viva session is no longer available to start.' };
      }

      if (phase === 'running') {
        if (snapshotPanelAdminId(vivaSession) !== actor.id) {
          return { success: false, reason: 'forbidden', error: 'Only the assigned panel admin can open this Viva session.' };
        }
        const workspace = workspaceFromSnapshot(vivaSession);
        return workspace
          ? { success: true, workspace: { ...workspace, canManage: true }, started: false }
          : { success: false, reason: 'invalid', error: 'This active Viva session has incomplete assessment context.' };
      }

      const currentContext = await readCurrentContext(vivaSession, actor.id, databaseSession);
      if (!currentContext.success) return currentContext;
      await createParticipantLocks(sessionId, currentContext.context, databaseSession);

      const vivaDurationMinutes = Number(currentContext.context.round.vivaDurationMinutes);
      const vivaEndsAt = new Date(startedAt.getTime() + vivaDurationMinutes * 60_000);
      const startedSession = await VivaSession.findOneAndUpdate(
        { _id: sessionId, startedAt: null, completedAt: null, cancelledAt: null },
        {
          $set: {
            startedAt,
            vivaEndsAt,
            ...toSessionSnapshots(currentContext.context),
          },
        },
        { returnDocument: 'after', session: databaseSession }
      ).lean<VivaSessionRecord | null>();
      if (!startedSession) {
        throw new VivaStartAbort({
          success: false,
          reason: 'concurrent-change',
          error: 'This Viva session changed before it could be started. Reload and try again.',
        });
      }

      await recordVivaAuditEvent(
        {
          roundId: String(currentContext.context.round._id),
          sessionId,
          event: 'session-started',
          actorId: actor.id,
          actorRole: 'supervisor',
          actorName: actor.name,
          actorRollNo: actor.rollNo,
          occurredAt: startedAt,
        },
        databaseSession
      );

      const workspace = workspaceFromSnapshot(startedSession);
      if (!workspace) throw new Error('Started Viva session could not be serialized.');
      return { success: true, workspace: { ...workspace, canManage: true }, started: true };
    });
  } catch (error) {
    if (error instanceof VivaStartAbort) return error.result;
    if (isDuplicateKeyError(error)) {
      return {
        success: false,
        reason: 'invalid',
        error: 'A Viva participant is already in an active session.',
      };
    }
    throw error;
  }
}
