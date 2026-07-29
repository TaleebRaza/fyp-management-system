import { NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';
import { normalizeStorageKey } from '../../../../lib/security/storage';
import { enqueueStorageDeletion, withStorageTransaction } from '../../../../lib/storageProtocol';
import User from '../../../../models/User';
import VoiceNote from '../../../../models/VoiceNote';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!hasValidCronAuthorization(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    console.warn('Unauthorized cron execution attempt blocked.');
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const seventyTwoHoursAgo = new Date(now - 72 * 60 * 60 * 1000);
    const cleanup = await withStorageTransaction(async (session) => {
      let purgedVoiceNotesCount = 0;
      let purgedBroadcastsCount = 0;
      let queuedDeletionBytes = 0;
      const expiredNotes = await VoiceNote.find({ createdAt: { $lte: twentyFourHoursAgo } }).session(session);
      for (const note of expiredNotes) {
        await enqueueStorageDeletion(
          { key: note.blobUrl, bytes: Number(note.fileSize || 0), reason: 'voice-expired' },
          session
        );
        queuedDeletionBytes += Number(note.fileSize || 0);
      }
      if (expiredNotes.length > 0) {
        await VoiceNote.deleteMany({ _id: { $in: expiredNotes.map((note) => note._id) } }).session(session);
      }
      purgedVoiceNotesCount = expiredNotes.length;

      const expiredBroadcasts = await User.find({
        role: 'supervisor',
        broadcastType: 'audio',
        broadcastContent: { $ne: null },
        broadcastCreatedAt: { $lte: seventyTwoHoursAgo },
      }).session(session);
      for (const supervisor of expiredBroadcasts) {
        const key = normalizeStorageKey(supervisor.broadcastContent);
        if (key) {
          await enqueueStorageDeletion(
            { key, bytes: Number(supervisor.broadcastSize || 0), reason: 'broadcast-expired' },
            session
          );
          queuedDeletionBytes += Number(supervisor.broadcastSize || 0);
        }
        supervisor.broadcastType = null;
        supervisor.broadcastContent = null;
        supervisor.broadcastSize = 0;
        supervisor.broadcastCreatedAt = null;
        await supervisor.save({ session });
      }
      purgedBroadcastsCount = expiredBroadcasts.length;
      return { purgedVoiceNotesCount, purgedBroadcastsCount, queuedDeletionBytes };
    });

    return NextResponse.json({
      message: 'Cleanup records were queued for storage deletion.',
      ...cleanup,
    });
  } catch {
    console.error('voice_cleanup_failed');
    return NextResponse.json({ error: 'Failed to execute scheduled cleanup.' }, { status: 500 });
  }
}
