import type { ClientSession } from 'mongoose';
import VoiceNote from '../models/VoiceNote';
import VoiceNoteQuota from '../models/VoiceNoteQuota';
import { normalizeStorageKey } from './security/storageKey';
import { collectStorageDeletionTargets } from './storageDeletionTargets';
import { findSharedStorageKeys } from './storageReferenceSafety';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  StorageProtocolError,
} from './storageProtocol';

export async function enqueueDeletedProjectStorage({
  project,
  extraPdfUrls = [],
  reason,
  session,
}: {
  project: { _id: unknown; pdfUrl?: unknown; pdfSize?: unknown };
  extraPdfUrls?: unknown[];
  reason: string;
  session: ClientSession;
}) {
  await assertStorageLedgerReady(session);
  const voiceNotes = await VoiceNote.find({ projectId: project._id })
    .select('_id blobUrl fileSize')
    .session(session)
    .lean();

  const storedReferences = [project.pdfUrl, ...extraPdfUrls, ...voiceNotes.map((note) => note.blobUrl)];
  const hasInvalidReference = storedReferences.some((value) => {
    if (value === null || value === undefined || String(value).trim() === '') return false;
    return typeof value !== 'string' || !normalizeStorageKey(value);
  });
  if (hasInvalidReference) {
    throw new StorageProtocolError(
      'Stored project files have invalid storage keys. Run the storage integrity audit before deleting the project.',
      409
    );
  }

  const targets = collectStorageDeletionTargets([
    { key: project.pdfUrl, bytes: project.pdfSize },
    ...extraPdfUrls.map((key) => ({ key, bytes: project.pdfSize })),
    ...voiceNotes.map((note) => ({ key: note.blobUrl, bytes: note.fileSize })),
  ]);
  const sharedKeys = await findSharedStorageKeys({
    keys: targets.map((target) => target.key),
    excludedProjectIds: [project._id],
    excludedVoiceNoteIds: voiceNotes.map((note) => note._id),
    session,
  });
  const deletionTargets = targets.filter((target) => !sharedKeys.has(target.key));

  for (const target of deletionTargets) {
    await enqueueStorageDeletion({ ...target, reason }, session);
  }

  if (voiceNotes.length > 0) {
    await VoiceNote.deleteMany({ _id: { $in: voiceNotes.map((note) => note._id) } }, { session });
  }
  await VoiceNoteQuota.deleteMany({ projectId: project._id }, { session });

  return {
    queuedDeletionBytes: deletionTargets.reduce((sum, target) => sum + target.bytes, 0),
    queuedObjects: deletionTargets.length,
    deletedVoiceNotes: voiceNotes.length,
  };
}
