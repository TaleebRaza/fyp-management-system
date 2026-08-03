import { NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { processEmailOutbox } from '../../../../lib/emailOutbox';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';
import { normalizeStorageKey } from '../../../../lib/security/storage';
import { collectStorageDeletionTargets } from '../../../../lib/storageDeletionTargets';
import { findSharedStorageKeys } from '../../../../lib/storageReferenceSafety';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  expireUploadReservations,
  processStorageDeletionOutbox,
  releaseVoiceNoteSlot,
  withStorageTransaction,
} from '../../../../lib/storageProtocol';
import User from '../../../../models/User';
import VoiceNote from '../../../../models/VoiceNote';

export const dynamic = 'force-dynamic';

const CLEANUP_LIMIT = 100;

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    console.warn('Unauthorized cron execution attempt blocked.');
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const now = Date.now();
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const seventyTwoHoursAgo = new Date(now - 72 * 60 * 60 * 1000);
    const cleanup = await withStorageTransaction(async (session) => {
      await assertStorageLedgerReady(session);
      let purgedVoiceNotesCount = 0;
      let purgedBroadcastsCount = 0;
      let skippedInvalidVoiceNotesCount = 0;
      let skippedInvalidBroadcastsCount = 0;
      let queuedDeletionBytes = 0;
      const expiredNotes = await VoiceNote.find({
        $or: [
          { createdAt: { $lte: twentyFourHoursAgo } },
          { isPlayed: true, playedAt: { $lte: tenMinutesAgo } },
        ],
      })
        .sort({ createdAt: 1, _id: 1 })
        .limit(CLEANUP_LIMIT)
        .session(session);
      const validExpiredNotes = expiredNotes.filter((note) => normalizeStorageKey(note.blobUrl));
      skippedInvalidVoiceNotesCount = expiredNotes.length - validExpiredNotes.length;
      const voiceTargets = collectStorageDeletionTargets(
        validExpiredNotes.map((note) => ({ key: note.blobUrl, bytes: note.fileSize }))
      );
      const sharedVoiceKeys = await findSharedStorageKeys({
        keys: voiceTargets.map((target) => target.key),
        excludedVoiceNoteIds: validExpiredNotes.map((note) => note._id),
        session,
      });
      for (const target of voiceTargets) {
        if (sharedVoiceKeys.has(target.key)) continue;
        await enqueueStorageDeletion(
          { ...target, reason: 'voice-expired' },
          session
        );
        queuedDeletionBytes += target.bytes;
      }
      if (validExpiredNotes.length > 0) {
        await VoiceNote.deleteMany({
          _id: { $in: validExpiredNotes.map((note) => note._id) },
        }).session(session);
        for (const note of validExpiredNotes) {
          await releaseVoiceNoteSlot(String(note.senderId), String(note.projectId), session);
        }
      }
      purgedVoiceNotesCount = validExpiredNotes.length;

      const expiredBroadcasts = await User.find({
        role: 'supervisor',
        broadcastType: 'audio',
        broadcastContent: { $ne: null },
        broadcastCreatedAt: { $lte: seventyTwoHoursAgo },
      })
        .sort({ broadcastCreatedAt: 1, _id: 1 })
        .limit(CLEANUP_LIMIT)
        .session(session);
      const validExpiredBroadcasts = expiredBroadcasts.filter((supervisor) =>
        normalizeStorageKey(supervisor.broadcastContent)
      );
      skippedInvalidBroadcastsCount = expiredBroadcasts.length - validExpiredBroadcasts.length;
      const broadcastTargets = collectStorageDeletionTargets(
        validExpiredBroadcasts.map((supervisor) => ({
          key: normalizeStorageKey(supervisor.broadcastContent),
          bytes: supervisor.broadcastSize,
        }))
      );
      const sharedBroadcastKeys = await findSharedStorageKeys({
        keys: broadcastTargets.map((target) => target.key),
        excludedSupervisorIds: validExpiredBroadcasts.map((supervisor) => supervisor._id),
        session,
      });
      for (const target of broadcastTargets) {
        if (sharedBroadcastKeys.has(target.key)) continue;
        await enqueueStorageDeletion({ ...target, reason: 'broadcast-expired' }, session);
        queuedDeletionBytes += target.bytes;
      }
      for (const supervisor of validExpiredBroadcasts) {
        supervisor.broadcastType = null;
        supervisor.broadcastContent = null;
        supervisor.broadcastSize = 0;
        supervisor.broadcastCreatedAt = null;
        await supervisor.save({ session });
      }
      purgedBroadcastsCount = validExpiredBroadcasts.length;
      return {
        purgedVoiceNotesCount,
        purgedBroadcastsCount,
        skippedInvalidVoiceNotesCount,
        skippedInvalidBroadcastsCount,
        queuedDeletionBytes,
      };
    });
    const reservations = await expireUploadReservations();
    const [storageDeletions, emails] = await Promise.all([
      processStorageDeletionOutbox(),
      processEmailOutbox(),
    ]);

    return NextResponse.json({
      message: 'Cleanup and durable background work completed.',
      ...cleanup,
      reservations,
      storageDeletions,
      emails,
    });
  } catch {
    console.error('voice_cleanup_failed');
    return NextResponse.json({ error: 'Failed to execute scheduled cleanup.' }, { status: 500 });
  }
}
