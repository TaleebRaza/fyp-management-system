import mongoose, { type ClientSession } from 'mongoose';

import Project from '../models/Project';
import User from '../models/User';
import VivaPanel from '../models/VivaPanel';
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
  phase: 'scheduled' | 'running';
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
  | { success: true; result: VivaGradeResult; completedAt: string }
  | VivaSessionMutationFailure;

type VivaSessionStartFailure = Extract<VivaSessionStartResult, { success: false }>;

class VivaStartAbort extends Error {
  constructor(readonly result: VivaSessionStartFailure) {
    super(result.error);
  }
}

type VivaRoundRecord = {
  _id: unknown;
  name?: unknown;
  targetPanelSize?: unknown;
  minimumPanelSize?: unknown;
  vivaDurationMinutes?: unknown;
  frozenAt?: Date | null;
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
  ) {
    return null;
  }

  const domains = Array.isArray(projectSnapshot.domains)
    ? projectSnapshot.domains.filter((domain): domain is string => typeof domain === 'string')
    : [];
  return {
    id: String(session._id),
    phase: 'running',
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

async function readCurrentContext(
  vivaSession: VivaSessionRecord,
  actorId: string,
  databaseSession?: ClientSession
): Promise<{ success: true; context: CurrentContext } | Extract<VivaSessionStartResult, { success: false }>> {
  const roundId = asId(vivaSession.roundId);
  const panelId = asId(vivaSession.panelId);
  const projectId = asId(vivaSession.projectId);
  if (!roundId || !panelId || !projectId) {
    return { success: false, reason: 'invalid', error: 'This Viva session has incomplete scheduling data.' };
  }

  const roundQuery = VivaRound.findById(roundId)
    .select('_id name targetPanelSize minimumPanelSize vivaDurationMinutes frozenAt');
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
  if (String(panel.roundId) !== roundId || String(vivaSession.roundId) !== roundId) {
    return { success: false, reason: 'invalid', error: 'This Viva session no longer matches its scheduled panel.' };
  }
  if (String(vivaSession.projectId) !== projectId) {
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
  if (panelAdminId !== actorId) {
    return { success: false, reason: 'forbidden', error: 'Only the assigned panel admin can open this Viva session.' };
  }
  if (projectSupervisorId && panelMemberIds.includes(projectSupervisorId)) {
    return { success: false, reason: 'invalid', error: 'A team cannot be examined by its own supervisor.' };
  }

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

  const panelMembers = panelMemberIds.map((id) => peopleById.get(id)).map((person) => person && toPerson(person));
  const projectMembers = projectMemberIds.map((id) => peopleById.get(id)).map((person) => person && toPerson(person));
  const panelUsers = panelMemberIds.map((id) => peopleById.get(id));
  const projectUsers = projectMemberIds.map((id) => peopleById.get(id));
  if (
    !arePresent(panelMembers)
    || !arePresent(projectMembers)
    || panelUsers.some((person) => person?.role !== 'supervisor' || person.isActive !== true)
    || projectUsers.some((person) => person?.role !== 'student')
  ) {
    return { success: false, reason: 'invalid', error: 'One or more current Viva participants are no longer valid.' };
  }

  const panelAdmin = panelMembers.find((person) => person?.id === panelAdminId);
  const supervisorRecord = projectSupervisorId ? peopleById.get(projectSupervisorId) : undefined;
  const projectSupervisor = supervisorRecord?.role === 'supervisor' ? toPerson(supervisorRecord) : null;
  if (!panelAdmin) {
    return { success: false, reason: 'invalid', error: 'The assigned panel admin is no longer a valid panel member.' };
  }

  return {
    success: true,
    context: {
      round,
      panel,
      project,
      panelMembers,
      panelAdmin,
      projectMembers,
      projectSupervisor,
    },
  };
}

async function findActiveParticipantConflict(
  vivaSession: VivaSessionRecord,
  context: CurrentContext,
  databaseSession: ClientSession
): Promise<string | null> {
  const activeSessions = await VivaSession.find({
    _id: { $ne: vivaSession._id },
    startedAt: { $type: 'date' },
    completedAt: null,
    cancelledAt: null,
  })
    .select('_id panelId projectId')
    .session(databaseSession)
    .lean<VivaSessionRecord[]>();
  if (activeSessions.length === 0) return null;

  const [panels, projects] = await Promise.all([
    VivaPanel.find({ _id: { $in: activeSessions.map((session) => session.panelId) } })
      .select('_id examinerIds')
      .session(databaseSession)
      .lean<VivaPanelRecord[]>(),
    Project.find({ _id: { $in: activeSessions.map((session) => session.projectId) } })
      .select('_id members')
      .session(databaseSession)
      .lean<VivaProjectRecord[]>(),
  ]);
  const panelMembersById = new Map(
    panels.map((panel) => [String(panel._id), asIdList(panel.examinerIds)])
  );
  const projectMembersById = new Map(
    projects.map((project) => [String(project._id), asIdList(project.members)])
  );
  const panelMemberIds = new Set(context.panelMembers.map((member) => member.id));
  const projectMemberIds = new Set(context.projectMembers.map((member) => member.id));

  for (const activeSession of activeSessions) {
    const activePanelMembers = panelMembersById.get(String(activeSession.panelId));
    const activeProjectMembers = projectMembersById.get(String(activeSession.projectId));
    if (!activePanelMembers || !activeProjectMembers) {
      return 'An active Viva session has incomplete participant data. Resolve it before starting another session.';
    }
    if (
      activePanelMembers.some((memberId) => panelMemberIds.has(memberId))
      || activeProjectMembers.some((memberId) => projectMemberIds.has(memberId))
    ) {
      return 'A Viva participant is already in an active session.';
    }
  }

  return null;
}

async function reserveStartParticipants(
  context: CurrentContext,
  databaseSession: ClientSession
): Promise<boolean> {
  const participantIds = [...new Set([
    ...context.panelMembers.map((member) => member.id),
    ...context.projectMembers.map((member) => member.id),
  ])];
  // This write makes concurrent starts that share a person conflict and retry as one transaction.
  const result = await User.updateMany(
    { _id: { $in: participantIds } },
    { $currentDate: { updatedAt: true } },
    { session: databaseSession, timestamps: false }
  );
  return result.matchedCount === participantIds.length;
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

  return withVivaTransaction(async (databaseSession) => {
    const vivaSession = await readSession(sessionId, databaseSession);
    if (!vivaSession) {
      return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
    }

    const authorization = gradeWritePermission(vivaSession, actor);
    if (authorization) return authorization;

    const permission = getVivaGradeChangePermission(sessionPhase(vivaSession), grade);
    if (!permission.permitted) {
      return { success: false, reason: 'invalid', error: 'Select a valid Viva grade.' };
    }

    const updatedSession = await VivaSession.findOneAndUpdate(
      {
        _id: sessionId,
        version,
        startedAt: { $type: 'date' },
        completedAt: null,
        cancelledAt: null,
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
    return { success: true, workspace };
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
    const vivaSession = await readSession(sessionId, databaseSession);
    if (!vivaSession) {
      return { success: false, reason: 'not-found', error: 'This Viva session no longer exists.' };
    }

    const authorization = gradeWritePermission(vivaSession, actor);
    if (authorization) return authorization;

    const result = canonicalSessionResult(vivaSession.result);
    if (!result) {
      return {
        success: false,
        reason: 'invalid',
        error: 'Save a valid Viva grade before completing this session.',
      };
    }

    const completedSession = await VivaSession.findOneAndUpdate(
      {
        _id: sessionId,
        version,
        startedAt: { $type: 'date' },
        completedAt: null,
        cancelledAt: null,
        'result.grade': result.grade,
        'result.percentage': result.percentage,
      },
      {
        $set: { completedAt },
        $inc: { version: 1 },
      },
      { returnDocument: 'after', runValidators: true, session: databaseSession }
    ).lean<VivaSessionRecord | null>();
    if (!completedSession) {
      return {
        success: false,
        reason: 'concurrent-change',
        error: 'Another tab changed this Viva session. Reload before completing it.',
      };
    }

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

    return { success: true, result, completedAt: completedAt.toISOString() };
  });
}

export async function getPanelAdminVivaSessions(actorId: string): Promise<VivaSessionWorkspaceDto[]> {
  if (!mongoose.Types.ObjectId.isValid(actorId)) return [];

  const panels = await VivaPanel.find({ panelAdminId: actorId }).select('_id').lean<VivaPanelRecord[]>();
  if (panels.length === 0) return [];

  const sessions = await VivaSession.find({
    panelId: { $in: panels.map((panel) => panel._id) },
    completedAt: null,
    cancelledAt: null,
  })
    .select('roundId panelId projectId scheduledAt startedAt vivaEndsAt completedAt cancelledAt locationLabel result version roundSnapshot projectSnapshot panelSnapshot')
    .sort({ scheduledAt: 1, _id: 1 })
    .lean<VivaSessionRecord[]>();

  const workspaces = await Promise.all(sessions.map(async (vivaSession) => {
    const phase = sessionPhase(vivaSession);
    if (phase === 'running') {
      const context = await readCurrentContext(vivaSession, actorId);
      return context.success ? workspaceFromSnapshot(vivaSession) : null;
    }
    if (phase !== 'scheduled') return null;

    const context = await readCurrentContext(vivaSession, actorId);
    return context.success ? workspaceFromCurrentContext(vivaSession, context.context) : null;
  }));

  return workspaces.filter((workspace): workspace is VivaSessionWorkspaceDto => Boolean(workspace));
}

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

      const currentContext = await readCurrentContext(vivaSession, actor.id, databaseSession);
      if (!currentContext.success) return currentContext;

      if (phase === 'running') {
        const workspace = workspaceFromSnapshot(vivaSession);
        return workspace
          ? { success: true, workspace, started: false }
          : { success: false, reason: 'invalid', error: 'This active Viva session has incomplete assessment context.' };
      }

      if (!await reserveStartParticipants(currentContext.context, databaseSession)) {
        throw new VivaStartAbort({
          success: false,
          reason: 'invalid',
          error: 'One or more Viva participants are no longer valid.',
        });
      }

      const activeConflict = await findActiveParticipantConflict(
        vivaSession,
        currentContext.context,
        databaseSession
      );
      if (activeConflict) {
        throw new VivaStartAbort({ success: false, reason: 'invalid', error: activeConflict });
      }

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

      await VivaRound.findOneAndUpdate(
        {
          _id: currentContext.context.round._id,
          $or: [{ frozenAt: null }, { frozenAt: { $exists: false } }],
        },
        { $set: { frozenAt: startedAt } },
        { session: databaseSession }
      );
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
      return { success: true, workspace, started: true };
    });
  } catch (error) {
    if (error instanceof VivaStartAbort) return error.result;
    throw error;
  }
}
