import mongoose from 'mongoose';

import VivaSession from '../models/VivaSession';
import { getVivaGradeResult } from './viva';

export type VivaResultPersonDto = {
  id: string;
  name: string;
  rollNo: string;
};

export type VivaStudentResultDto = {
  sessionId: string;
  roundName: string;
  grade: string;
  percentage: number;
  completedAt: string;
  panel: {
    id: string;
    admin: VivaResultPersonDto;
    members: VivaResultPersonDto[];
  };
};

type VivaResultSessionRecord = {
  _id: unknown;
  completedAt?: Date | null;
  result?: { grade?: unknown; percentage?: unknown };
  roundSnapshot?: { name?: unknown };
  panelSnapshot?: {
    panelId?: unknown;
    panelAdmin?: unknown;
    examiners?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function personFromSnapshot(value: unknown): VivaResultPersonDto | null {
  if (!isRecord(value)) return null;

  const id = typeof value.userId === 'string' ? value.userId.trim() : '';
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const rollNo = typeof value.rollNo === 'string' ? value.rollNo.trim() : '';
  return id && name && rollNo ? { id, name, rollNo } : null;
}

function resultFromSession(session: VivaResultSessionRecord): VivaStudentResultDto | null {
  const completedAt = session.completedAt instanceof Date && Number.isFinite(session.completedAt.getTime())
    ? session.completedAt.toISOString()
    : null;
  const result = getVivaGradeResult(session.result?.grade);
  const roundName = typeof session.roundSnapshot?.name === 'string' ? session.roundSnapshot.name.trim() : '';
  const panelId = typeof session.panelSnapshot?.panelId === 'string' ? session.panelSnapshot.panelId.trim() : '';
  const admin = personFromSnapshot(session.panelSnapshot?.panelAdmin);
  const members = Array.isArray(session.panelSnapshot?.examiners)
    ? session.panelSnapshot.examiners.map(personFromSnapshot)
    : [];
  if (
    !completedAt
    || !result
    || session.result?.percentage !== result.percentage
    || !roundName
    || !panelId
    || !admin
    || members.some((member) => !member)
    || members.length === 0
  ) {
    return null;
  }

  return {
    sessionId: String(session._id),
    roundName,
    grade: result.grade,
    percentage: result.percentage,
    completedAt,
    panel: {
      id: panelId,
      admin,
      members: members.filter((member): member is VivaResultPersonDto => Boolean(member)),
    },
  };
}

export async function getCompletedVivaResultsForStudent(studentId: string): Promise<VivaStudentResultDto[]> {
  if (!mongoose.Types.ObjectId.isValid(studentId)) return [];

  const sessions = await VivaSession.find({
    'projectSnapshot.members.userId': studentId,
    completedAt: { $type: 'date' },
    cancelledAt: null,
  })
    .select('_id completedAt result roundSnapshot.name panelSnapshot.panelId panelSnapshot.panelAdmin panelSnapshot.examiners')
    .sort({ completedAt: -1, _id: -1 })
    .lean<VivaResultSessionRecord[]>();

  return sessions.flatMap((session) => {
    const result = resultFromSession(session);
    return result ? [result] : [];
  });
}
