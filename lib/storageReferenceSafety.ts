import type { ClientSession } from 'mongoose';
import Project from '../models/Project';
import User from '../models/User';
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
  session,
}: {
  keys: string[];
  excludedProjectIds?: unknown[];
  excludedVoiceNoteIds?: unknown[];
  excludedSupervisorIds?: unknown[];
  session: ClientSession;
}) {
  const candidateKeys = new Set(keys);
  if (candidateKeys.size === 0) return new Set<string>();

  // MongoDB sessions do not support parallel operations inside a transaction.
  const projects = await Project.find({
    ...excludingIds(excludedProjectIds),
    pdfUrl: { $exists: true, $nin: ['', null] },
  }).select('pdfUrl').session(session).lean();
  const voiceNotes = await VoiceNote.find({
    ...excludingIds(excludedVoiceNoteIds),
    blobUrl: { $exists: true, $nin: ['', null] },
  }).select('blobUrl').session(session).lean();
  const supervisors = await User.find({
    ...excludingIds(excludedSupervisorIds),
    role: 'supervisor',
    broadcastType: 'audio',
    broadcastContent: { $exists: true, $nin: ['', null] },
  }).select('broadcastContent').session(session).lean();

  const referencedKeys = [
    ...projects.map((project) => normalizeStorageKey(project.pdfUrl)),
    ...voiceNotes.map((voiceNote) => normalizeStorageKey(voiceNote.blobUrl)),
    ...supervisors.map((supervisor) => normalizeStorageKey(supervisor.broadcastContent)),
  ];

  return new Set(
    referencedKeys.filter((key): key is string => Boolean(key && candidateKeys.has(key)))
  );
}
