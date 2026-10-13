import type { ClientSession } from 'mongoose';
import Project from '../models/Project';
import User from '../models/User';
import VivaSession from '../models/VivaSession';
import VoiceNote from '../models/VoiceNote';
import { normalizeStorageKey } from './storageValidation';

function excludingIds(ids: unknown[]) {
  return ids.length > 0 ? { _id: { $nin: ids } } : {};
}

export async function findSharedStorageKeys({
  keys,
  excludedProjectIds = [],
  excludedVoiceNoteIds = [],
  excludedSupervisorIds = [],
  excludedStudentIds = [],
  excludedVivaSessionIds = [],
  session,
}: {
  keys: string[];
  excludedProjectIds?: unknown[];
  excludedVoiceNoteIds?: unknown[];
  excludedSupervisorIds?: unknown[];
  excludedStudentIds?: unknown[];
  excludedVivaSessionIds?: unknown[];
  session: ClientSession;
}) {
  const candidateKeys = new Set(keys);
  if (candidateKeys.size === 0) return new Set<string>();

  // Only noncanonical references need the legacy URL/encoded-path fallback.
  const references = (field: string) => ({ $or: [
    { [field]: { $in: [...candidateKeys] } },
    { [field]: { $regex: /(^\s|\s$|^\/|^[a-zA-Z][a-zA-Z\d+.-]*:|%)/ } },
  ] });

  // MongoDB sessions do not support parallel operations inside a transaction.
  const projects = await Project.find({
    ...excludingIds(excludedProjectIds),
    ...references('pdfUrl'),
  }).select('pdfUrl').session(session).lean();
  const voiceNotes = await VoiceNote.find({
    ...excludingIds(excludedVoiceNoteIds),
    ...references('blobUrl'),
  }).select('blobUrl').session(session).lean();
  const supervisors = await User.find({
    ...excludingIds(excludedSupervisorIds),
    role: 'supervisor',
    broadcastType: 'audio',
    ...references('broadcastContent'),
  }).select('broadcastContent').session(session).lean();
  const students = await User.find({
    ...excludingIds(excludedStudentIds),
    role: 'student',
    studentMessageType: 'audio',
    ...references('studentMessageContent'),
  }).select('studentMessageContent').session(session).lean();
  const vivaSessions = await VivaSession.find({
    ...excludingIds(excludedVivaSessionIds),
    ...references('projectSnapshot.pdfUrl'),
  }).select('projectSnapshot.pdfUrl').session(session).lean();

  const referencedKeys = [
    ...projects.map((project) => normalizeStorageKey(project.pdfUrl)),
    ...voiceNotes.map((voiceNote) => normalizeStorageKey(voiceNote.blobUrl)),
    ...supervisors.map((supervisor) => normalizeStorageKey(supervisor.broadcastContent)),
    ...students.map((student) => normalizeStorageKey(student.studentMessageContent)),
    ...vivaSessions.map((vivaSession) => normalizeStorageKey(vivaSession.projectSnapshot?.pdfUrl)),
  ];

  return new Set(
    referencedKeys.filter((key): key is string => Boolean(key && candidateKeys.has(key)))
  );
}
