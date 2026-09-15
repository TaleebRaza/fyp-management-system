import mongoose, { type ClientSession } from 'mongoose';

import VivaRound from '../models/VivaRound';
import VivaAuditEvent from '../models/VivaAuditEvent';
import VivaPanel from '../models/VivaPanel';
import VivaSession from '../models/VivaSession';
import Project from '../models/Project';
import User from '../models/User';
import { collectStorageDeletionTargets } from './storageDeletionTargets';
import { findSharedStorageKeys } from './storageReferenceSafety';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  StorageProtocolError,
} from './storageProtocol';
import { normalizeStorageKey } from './storageValidation';
import { getVivaPanels, type VivaPanelDto, validateVivaPanelsForRound } from './vivaPanelAdmin';
import { getVivaAssessments, type VivaAssessmentDto } from './vivaPublication';
import { getVivaSchedules, type VivaScheduleDto } from './vivaScheduling';
import {
  type VivaConfiguration,
  validateVivaConfiguration,
} from './viva';
import { recordVivaAuditEvent, withVivaTransaction } from './vivaPersistence';

export type VivaRoundInput = VivaConfiguration & {
  name: string;
  projectIds: string[];
  examinerIds: string[];
};

export type VivaRoundDto = VivaRoundInput & {
  id: string;
  panelRevision: number;
  frozenAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type VivaTeamOption = {
  id: string;
  title: string;
  members: Array<{ id: string; name: string; rollNo: string }>;
};

export type VivaExaminerOption = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaRoundAdminData = {
  rounds: VivaRoundDto[];
  teams: VivaTeamOption[];
  examiners: VivaExaminerOption[];
  panels: VivaPanelDto[];
  schedules: VivaScheduleDto[];
  assessments: VivaAssessmentDto[];
};

export type VivaRoundActor = {
  id: string;
  name: string;
  rollNo: string;
};

type VivaRoundRecord = {
  _id: unknown;
  name?: unknown;
  targetPanelSize?: unknown;
  minimumPanelSize?: unknown;
  vivaDurationMinutes?: unknown;
  projectIds?: unknown;
  examinerIds?: unknown;
  panelRevision?: unknown;
  frozenAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

type ProjectRecord = {
  _id: unknown;
  title?: unknown;
  members?: unknown[];
};

type UserRecord = {
  _id: unknown;
  name?: unknown;
  rollNo?: unknown;
};

type ParsedVivaRoundInput =
  | { success: true; input: VivaRoundInput }
  | { success: false; error: string };

export type VivaRoundSaveResult =
  | { success: true; round: VivaRoundDto }
  | {
      success: false;
      reason: 'selection-unavailable' | 'not-found' | 'frozen';
      error: string;
    };

export type VivaRoundDeleteResult =
  | { success: true }
  | {
      success: false;
      reason: 'invalid' | 'not-found' | 'frozen';
      error: string;
    };

function readRequiredText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== 'string') return null;

  const text = value.trim();
  return text && text.length <= maximumLength ? text : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseObjectIdList(value: unknown, label: string):
  | { success: true; ids: string[] }
  | { success: false; error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { success: false, error: `Select at least one ${label}.` };
  }

  const ids = value.flatMap((candidate) =>
    typeof candidate === 'string' && mongoose.Types.ObjectId.isValid(candidate)
      ? [candidate]
      : []
  );

  if (ids.length !== value.length || new Set(ids).size !== ids.length) {
    return { success: false, error: `The selected ${label} are invalid.` };
  }

  return { success: true, ids };
}

function asDateString(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString()
    : null;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asPanelRevision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function serializeVivaRound(round: VivaRoundRecord): VivaRoundDto {
  return {
    id: String(round._id),
    name: typeof round.name === 'string' ? round.name : '',
    targetPanelSize: Number(round.targetPanelSize),
    minimumPanelSize: Number(round.minimumPanelSize),
    vivaDurationMinutes: Number(round.vivaDurationMinutes),
    projectIds: asStringList(round.projectIds),
    examinerIds: asStringList(round.examinerIds),
    panelRevision: asPanelRevision(round.panelRevision),
    frozenAt: asDateString(round.frozenAt),
    createdAt: asDateString(round.createdAt),
    updatedAt: asDateString(round.updatedAt),
  };
}

export function parseVivaRoundInput(value: unknown): ParsedVivaRoundInput {
  if (!isRecord(value)) {
    return { success: false, error: 'Invalid Viva round details.' };
  }

  const input = value;
  const name = readRequiredText(input.name, 120);
  if (!name) {
    return { success: false, error: 'Enter a round name up to 120 characters.' };
  }

  const configuration = validateVivaConfiguration({
    targetPanelSize: input.targetPanelSize,
    minimumPanelSize: input.minimumPanelSize,
    vivaDurationMinutes: input.vivaDurationMinutes,
  });
  if (!configuration.success) {
    return { success: false, error: 'Check the panel sizes and Viva duration.' };
  }

  const projects = parseObjectIdList(input.projectIds, 'team');
  if (!projects.success) return projects;

  const examiners = parseObjectIdList(input.examinerIds, 'active teacher');
  if (!examiners.success) return examiners;

  return {
    success: true,
    input: {
      name,
      ...configuration.configuration,
      projectIds: projects.ids,
      examinerIds: examiners.ids,
    },
  };
}

async function validateSelectedPeopleAndTeams(
  input: VivaRoundInput,
  session: ClientSession
): Promise<string | null> {
  const projects = await Project.find({ _id: { $in: input.projectIds } })
    .select('_id members')
    .session(session)
    .lean<ProjectRecord[]>();
  const examiners = await User.find({
    _id: { $in: input.examinerIds },
    role: 'supervisor',
    isActive: true,
  })
    .select('_id')
    .session(session)
    .lean<UserRecord[]>();

  if (projects.length !== input.projectIds.length) {
    return 'One or more selected teams no longer exist.';
  }
  if (examiners.length !== input.examinerIds.length) {
    return 'One or more selected teachers are no longer active supervisors.';
  }

  const studentIds = Array.from(
    new Set(projects.flatMap((project) => (project.members || []).map(String)))
  );
  const activeStudents = studentIds.length > 0
    ? await User.find({ _id: { $in: studentIds }, role: 'student', isActive: true })
        .select('_id')
        .session(session)
        .lean<UserRecord[]>()
    : [];
  const activeStudentIds = new Set(activeStudents.map((student) => String(student._id)));

  if (
    projects.some(
      (project) => !(project.members || []).some((memberId) => activeStudentIds.has(String(memberId)))
    )
  ) {
    return 'Every selected team needs at least one active student.';
  }

  return null;
}

function toRoundFields(input: VivaRoundInput) {
  return {
    name: input.name,
    targetPanelSize: input.targetPanelSize,
    minimumPanelSize: input.minimumPanelSize,
    vivaDurationMinutes: input.vivaDurationMinutes,
    projectIds: input.projectIds,
    examinerIds: input.examinerIds,
  };
}

export async function getVivaRoundAdminData(): Promise<VivaRoundAdminData> {
  const projects = await Project.find({ members: { $exists: true, $ne: [] } })
    .select('_id title members')
    .sort({ title: 1, _id: 1 })
    .lean<ProjectRecord[]>();
  const studentIds = Array.from(
    new Set(projects.flatMap((project) => (project.members || []).map(String)))
  );

  const [students, examiners, rounds, panels, schedules, assessments] = await Promise.all([
    studentIds.length > 0
      ? User.find({ _id: { $in: studentIds }, role: 'student', isActive: true })
          .select('_id name rollNo')
          .lean<UserRecord[]>()
      : Promise.resolve([]),
    User.find({ role: 'supervisor', isActive: true })
      .select('_id name rollNo')
      .sort({ name: 1, _id: 1 })
      .lean<UserRecord[]>(),
    VivaRound.find()
      .select(
        'name targetPanelSize minimumPanelSize vivaDurationMinutes projectIds examinerIds panelRevision frozenAt createdAt updatedAt'
      )
      .sort({ createdAt: -1 })
      .lean<VivaRoundRecord[]>(),
    getVivaPanels(),
    getVivaSchedules(),
    getVivaAssessments(),
  ]);

  const studentsById = new Map(
    students.map((student) => [
      String(student._id),
      {
        id: String(student._id),
        name: typeof student.name === 'string' ? student.name : 'Unnamed student',
        rollNo: typeof student.rollNo === 'string' ? student.rollNo : '',
      },
    ])
  );

  return {
    rounds: rounds.map(serializeVivaRound),
    teams: projects.flatMap((project) => {
      const members = (project.members || []).flatMap((memberId) => {
        const member = studentsById.get(String(memberId));
        return member ? [member] : [];
      });
      if (members.length === 0) return [];

      return [{
        id: String(project._id),
        title: typeof project.title === 'string' && project.title.trim()
          ? project.title.trim()
          : 'Untitled project',
        members,
      }];
    }),
    examiners: examiners.map((examiner) => ({
      id: String(examiner._id),
      name: typeof examiner.name === 'string' ? examiner.name : 'Unnamed supervisor',
      rollNo: typeof examiner.rollNo === 'string' ? examiner.rollNo : '',
    })),
    panels,
    schedules,
    assessments,
  };
}

export async function createVivaRound(
  input: VivaRoundInput,
  actor: VivaRoundActor
): Promise<VivaRoundSaveResult> {
  return withVivaTransaction(async (session) => {
    const selectionError = await validateSelectedPeopleAndTeams(input, session);
    if (selectionError) {
      return { success: false, reason: 'selection-unavailable', error: selectionError };
    }

    const round = new VivaRound(toRoundFields(input));
    await round.save({ session });
    await recordVivaAuditEvent(
      {
        roundId: String(round._id),
        event: 'round-created',
        actorId: actor.id,
        actorRole: 'admin',
        actorName: actor.name,
        actorRollNo: actor.rollNo,
      },
      session
    );

    return { success: true, round: serializeVivaRound(round.toObject()) };
  });
}

export async function updateVivaRound(
  roundId: string,
  input: VivaRoundInput,
  actor: VivaRoundActor
): Promise<VivaRoundSaveResult> {
  return withVivaTransaction(async (session) => {
    const existing = await VivaRound.findById(roundId)
      .select('frozenAt')
      .session(session)
      .lean<{ frozenAt?: Date | null }>();
    if (!existing) {
      return { success: false, reason: 'not-found', error: 'This Viva round no longer exists.' };
    }
    if (existing.frozenAt) {
      return { success: false, reason: 'frozen', error: 'This Viva round has started and can no longer be changed.' };
    }

    const selectionError = await validateSelectedPeopleAndTeams(input, session);
    if (selectionError) {
      return { success: false, reason: 'selection-unavailable', error: selectionError };
    }

    const panelError = await validateVivaPanelsForRound(input, roundId, session);
    if (panelError) {
      return { success: false, reason: 'selection-unavailable', error: panelError };
    }

    const updated = await VivaRound.findOneAndUpdate(
      { _id: roundId, frozenAt: null },
      { $set: toRoundFields(input) },
      { returnDocument: 'after', runValidators: true, session }
    ).lean<VivaRoundRecord | null>();
    if (!updated) {
      return { success: false, reason: 'frozen', error: 'This Viva round has started and can no longer be changed.' };
    }

    await recordVivaAuditEvent(
      {
        roundId,
        event: 'round-updated',
        actorId: actor.id,
        actorRole: 'admin',
        actorName: actor.name,
        actorRollNo: actor.rollNo,
      },
      session
    );

    return { success: true, round: serializeVivaRound(updated) };
  });
}

export async function deleteVivaRound(
  roundId: string,
  actor: VivaRoundActor
): Promise<VivaRoundDeleteResult> {
  if (!mongoose.Types.ObjectId.isValid(roundId)) {
    return { success: false, reason: 'invalid', error: 'Invalid Viva round.' };
  }

  return withVivaTransaction(async (session) => {
    const existing = await VivaRound.findById(roundId)
      .select('frozenAt')
      .session(session)
      .lean<{ frozenAt?: Date | null }>();
    if (!existing) {
      return { success: false, reason: 'not-found', error: 'This Viva round no longer exists.' };
    }
    if (existing.frozenAt) {
      return {
        success: false,
        reason: 'frozen',
        error: 'This Viva round has started and can no longer be changed.',
      };
    }

    const deletedRound = await VivaRound.findOneAndDelete({ _id: roundId, frozenAt: null }, { session });
    if (!deletedRound) {
      return {
        success: false,
        reason: 'frozen',
        error: 'This Viva round has started and can no longer be changed.',
      };
    }

    const vivaSessions = await VivaSession.find({ roundId })
      .select('_id projectSnapshot.pdfUrl projectSnapshot.pdfSize')
      .session(session)
      .lean<Array<{
        _id: unknown;
        projectSnapshot?: { pdfUrl?: unknown; pdfSize?: unknown };
      }>>();
    const snapshotFiles = vivaSessions.map(({ projectSnapshot }) => ({
      key: projectSnapshot?.pdfUrl,
      bytes: projectSnapshot?.pdfSize,
    }));
    const invalidSnapshotFile = snapshotFiles.some(({ key }) => (
      key !== null
      && key !== undefined
      && String(key).trim() !== ''
      && (typeof key !== 'string' || !normalizeStorageKey(key))
    ));
    if (invalidSnapshotFile) {
      throw new StorageProtocolError(
        'The Viva round has an invalid snapshot file reference. Run the storage integrity audit before deleting it.',
        409
      );
    }

    const storageTargets = collectStorageDeletionTargets(snapshotFiles);
    if (storageTargets.length > 0) {
      await assertStorageLedgerReady(session);
      const sharedKeys = await findSharedStorageKeys({
        keys: storageTargets.map(({ key }) => key),
        excludedVivaSessionIds: vivaSessions.map(({ _id }) => _id),
        session,
      });
      for (const storageTarget of storageTargets) {
        if (!sharedKeys.has(storageTarget.key)) {
          await enqueueStorageDeletion({ ...storageTarget, reason: 'viva-round-deleted' }, session);
        }
      }
    }

    await VivaSession.deleteMany({ roundId }, { session });
    await VivaPanel.deleteMany({ roundId }, { session });
    await VivaAuditEvent.deleteMany({ roundId }, { session });

    return { success: true };
  });
}
