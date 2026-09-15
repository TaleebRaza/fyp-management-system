import mongoose from 'mongoose';

import VivaSession from '../models/VivaSession';
import { getVivaGradeResult } from './viva';
import { recordVivaAuditEvent, withVivaTransaction } from './vivaPersistence';

export type VivaAssessmentPersonDto = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaAssessmentDto = {
  id: string;
  roundId: string;
  completedAt: string;
  publishedAt: string | null;
  result: {
    grade: string;
    percentage: number;
  };
  round: { name: string };
  project: {
    id: string;
    title: string;
    members: VivaAssessmentPersonDto[];
  };
  panel: {
    id: string;
    admin: VivaAssessmentPersonDto;
    members: VivaAssessmentPersonDto[];
  };
};

export type VivaPublishedResultDto = {
  assessmentId: string;
  roundName: string;
  grade: string;
  percentage: number;
  publishedAt: string;
};

export type VivaPublicationActor = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaPublicationInput = {
  sessionIds: string[];
};

export type VivaPublicationFailure = {
  sessionId: string;
  error: string;
};

export type VivaPublicationResult = {
  published: VivaAssessmentDto[];
  alreadyPublished: VivaAssessmentDto[];
  failures: VivaPublicationFailure[];
};

type VivaSnapshotPerson = {
  userId?: unknown;
  name?: unknown;
  rollNo?: unknown;
};

type VivaPublicationSessionRecord = {
  _id: unknown;
  roundId?: unknown;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  publishedAt?: Date | null;
  result?: {
    grade?: unknown;
    percentage?: unknown;
    selectedAt?: Date | null;
  };
  roundSnapshot?: {
    name?: unknown;
  };
  projectSnapshot?: {
    projectId?: unknown;
    title?: unknown;
    members?: unknown;
  };
  panelSnapshot?: {
    panelId?: unknown;
    panelAdmin?: unknown;
    examiners?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : String(value || '').trim();
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

function asDate(value: unknown): Date | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value : null;
}

function asIsoDate(value: unknown): string | null {
  return asDate(value)?.toISOString() || null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toPerson(value: unknown): VivaAssessmentPersonDto | null {
  if (!isRecord(value)) return null;

  const snapshot = value as VivaSnapshotPerson;
  const id = asId(snapshot.userId);
  const name = asText(snapshot.name);
  const rollNo = asText(snapshot.rollNo);
  return id && name && rollNo ? { id, name, rollNo } : null;
}

function toPeople(value: unknown): VivaAssessmentPersonDto[] | null {
  if (!Array.isArray(value)) return null;

  const people = value.map(toPerson);
  return people.every((person): person is VivaAssessmentPersonDto => Boolean(person)) ? people : null;
}

function canonicalResult(value: unknown): { grade: string; percentage: number } | null {
  if (!isRecord(value) || !asDate(value.selectedAt)) return null;

  const result = getVivaGradeResult(value.grade);
  return result && value.percentage === result.percentage ? result : null;
}

function toAssessment(session: VivaPublicationSessionRecord): VivaAssessmentDto | null {
  const id = asId(session._id);
  const roundId = asId(session.roundId);
  const completedAt = asIsoDate(session.completedAt);
  const result = canonicalResult(session.result);
  const roundName = asText(session.roundSnapshot?.name);
  const projectId = asId(session.projectSnapshot?.projectId);
  const projectTitle = typeof session.projectSnapshot?.title === 'string'
    && session.projectSnapshot.title.trim()
    ? session.projectSnapshot.title.trim()
    : 'Untitled project';
  const projectMembers = toPeople(session.projectSnapshot?.members);
  const panelId = asId(session.panelSnapshot?.panelId);
  const panelAdmin = toPerson(session.panelSnapshot?.panelAdmin);
  const panelMembers = toPeople(session.panelSnapshot?.examiners);
  if (
    !id
    || !roundId
    || !completedAt
    || !result
    || !roundName
    || !projectId
    || !projectMembers?.length
    || !panelId
    || !panelAdmin
    || !panelMembers?.length
  ) {
    return null;
  }

  return {
    id,
    roundId,
    completedAt,
    publishedAt: asIsoDate(session.publishedAt),
    result,
    round: { name: roundName },
    project: { id: projectId, title: projectTitle, members: projectMembers },
    panel: { id: panelId, admin: panelAdmin, members: panelMembers },
  };
}

const ASSESSMENT_FIELDS = [
  '_id',
  'roundId',
  'completedAt',
  'cancelledAt',
  'publishedAt',
  'result',
  'roundSnapshot.name',
  'projectSnapshot.projectId',
  'projectSnapshot.title',
  'projectSnapshot.members',
  'panelSnapshot.panelId',
  'panelSnapshot.panelAdmin',
  'panelSnapshot.examiners',
].join(' ');

export function parseVivaPublicationInput(value: unknown):
  | { success: true; input: VivaPublicationInput }
  | { success: false; error: string } {
  if (!isRecord(value) || !Array.isArray(value.sessionIds) || value.sessionIds.length === 0) {
    return { success: false, error: 'Select at least one completed Viva result to publish.' };
  }

  const sessionIds = value.sessionIds.flatMap((candidate) => {
    const id = typeof candidate === 'string' && mongoose.Types.ObjectId.isValid(candidate)
      ? candidate
      : null;
    return id ? [id] : [];
  });
  if (sessionIds.length !== value.sessionIds.length || new Set(sessionIds).size !== sessionIds.length) {
    return { success: false, error: 'The selected Viva results are invalid.' };
  }

  return { success: true, input: { sessionIds } };
}

export async function getVivaAssessments(): Promise<VivaAssessmentDto[]> {
  const sessions = await VivaSession.find({
    completedAt: { $type: 'date' },
    cancelledAt: null,
  })
    .select(ASSESSMENT_FIELDS)
    .sort({ completedAt: -1, _id: -1 })
    .lean<VivaPublicationSessionRecord[]>();

  return sessions.flatMap((session) => {
    const assessment = toAssessment(session);
    return assessment ? [assessment] : [];
  });
}

export async function getPublishedVivaResultsForStudent(studentId: string): Promise<VivaPublishedResultDto[]> {
  if (!mongoose.Types.ObjectId.isValid(studentId)) return [];

  const sessions = await VivaSession.find({
    'projectSnapshot.members.userId': studentId,
    completedAt: { $type: 'date' },
    cancelledAt: null,
    publishedAt: { $type: 'date' },
  })
    .select(ASSESSMENT_FIELDS)
    .sort({ publishedAt: -1, _id: -1 })
    .lean<VivaPublicationSessionRecord[]>();

  return sessions.flatMap((session) => {
    const assessment = toAssessment(session);
    if (!assessment?.publishedAt) return [];

    return [{
      assessmentId: assessment.id,
      roundName: assessment.round.name,
      grade: assessment.result.grade,
      percentage: assessment.result.percentage,
      publishedAt: assessment.publishedAt,
    }];
  });
}

export async function publishVivaResults(
  input: VivaPublicationInput,
  actor: VivaPublicationActor,
  publishedAt = new Date()
): Promise<VivaPublicationResult> {
  if (!mongoose.Types.ObjectId.isValid(actor.id) || !(publishedAt instanceof Date) || !Number.isFinite(publishedAt.getTime())) {
    throw new Error('Invalid Viva publication request.');
  }

  return withVivaTransaction(async (databaseSession) => {
    const sessions = await VivaSession.find({ _id: { $in: input.sessionIds } })
      .select(ASSESSMENT_FIELDS)
      .session(databaseSession)
      .lean<VivaPublicationSessionRecord[]>();
    const sessionsById = new Map(sessions.map((session) => [String(session._id), session]));
    const result: VivaPublicationResult = { published: [], alreadyPublished: [], failures: [] };

    for (const sessionId of input.sessionIds) {
      const vivaSession = sessionsById.get(sessionId);
      if (!vivaSession) {
        result.failures.push({ sessionId, error: 'This Viva session no longer exists.' });
        continue;
      }
      if (asDate(vivaSession.cancelledAt)) {
        result.failures.push({ sessionId, error: 'A cancelled Viva attempt cannot be published.' });
        continue;
      }
      if (!asDate(vivaSession.completedAt)) {
        result.failures.push({ sessionId, error: 'Only completed Viva results can be published.' });
        continue;
      }

      const assessment = toAssessment(vivaSession);
      if (!assessment) {
        result.failures.push({
          sessionId,
          error: 'This completed Viva assessment has incomplete historical data and cannot be published.',
        });
        continue;
      }
      if (assessment.publishedAt) {
        result.alreadyPublished.push(assessment);
        continue;
      }

      const write = await VivaSession.updateOne(
        {
          _id: sessionId,
          completedAt: { $type: 'date' },
          cancelledAt: null,
          publishedAt: null,
          'result.grade': assessment.result.grade,
          'result.percentage': assessment.result.percentage,
        },
        {
          $set: { publishedAt },
          $inc: { version: 1 },
        },
        { runValidators: true, session: databaseSession }
      );
      if (write.modifiedCount !== 1) {
        result.failures.push({
          sessionId,
          error: 'This Viva result changed before publication. Reload and try again.',
        });
        continue;
      }

      await recordVivaAuditEvent(
        {
          roundId: assessment.roundId,
          sessionId,
          event: 'result-published',
          actorId: actor.id,
          actorRole: 'admin',
          actorName: actor.name,
          actorRollNo: actor.rollNo,
          occurredAt: publishedAt,
        },
        databaseSession
      );
      result.published.push({ ...assessment, publishedAt: publishedAt.toISOString() });
    }

    return result;
  });
}
