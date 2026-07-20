// app/api/cron/voice-cleanup/route.ts
import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import VoiceNote from '../../../../models/VoiceNote';
import User from '../../../../models/User';
import { toR2DeletionTarget, type R2DeletionTarget } from '../../../../lib/r2Cleanup';
import { deleteR2Targets } from '../../../../lib/r2Deletion';
import { decrementStorageLedger } from '../../../../lib/storageLedger';

// Ensure Vercel never caches this route
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // 1. Strict Security Firewall: Only allow Vercel's Cron engine to execute this
  const authHeader = req.headers.get('authorization');
  
  // In local development, you might not have CRON_SECRET set, so we fail securely
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('Unauthorized cron execution attempt blocked.');
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    let purgedVoiceNotesCount = 0;
    let purgedBroadcastsCount = 0;

    const now = Date.now();

    // ==========================================
    // TASK 1: CLEANUP PLAYED (10 MINUTES) OR STALE (24 HOURS) VOICE NOTES
    // ==========================================
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const tenMinutesAgo = new Date(now - 10 * 60 * 1000);
    const expiredNotes = await VoiceNote.find({
      $or: [
        { isPlayed: true, playedAt: { $lte: tenMinutesAgo } },
        { createdAt: { $lte: twentyFourHoursAgo } },
      ],
    });

    // ==========================================
    // TASK 2: CLEANUP SUPERVISOR BROADCASTS (72 HRS)
    // ==========================================
    const seventyTwoHoursAgo = new Date(now - 72 * 60 * 60 * 1000);
    const expiredBroadcasts = await User.find({
      role: 'supervisor',
      broadcastType: 'audio',
      broadcastContent: { $ne: null },
      broadcastCreatedAt: { $lte: seventyTwoHoursAgo }
    });

    const deletionTargets = [
      ...expiredNotes.map(note => toR2DeletionTarget(note.blobUrl, note.fileSize)),
      ...expiredBroadcasts.map(user => toR2DeletionTarget(user.broadcastContent, user.broadcastSize)),
    ].filter(Boolean) as R2DeletionTarget[];

    if (deletionTargets.length > 0) {
      await deleteR2Targets(deletionTargets);
    }

    if (expiredNotes.length > 0) {
      purgedVoiceNotesCount = expiredNotes.length;
      await VoiceNote.deleteMany({ _id: { $in: expiredNotes.map(note => note._id) } });
    }

    if (expiredBroadcasts.length > 0) {
      purgedBroadcastsCount = expiredBroadcasts.length;
      const bulkOps = expiredBroadcasts.map(user => {
        return {
          updateOne: {
            filter: { _id: user._id },
            update: {
              $set: {
                broadcastType: null,
                broadcastContent: null,
                broadcastSize: 0,
                broadcastCreatedAt: null
              }
            }
          }
        };
      });

      await User.bulkWrite(bulkOps);
    }

    const totalRefundBytes = deletionTargets.reduce((sum, target) => sum + target.size, 0);
    if (totalRefundBytes > 0) {
      await decrementStorageLedger(totalRefundBytes);
    }

    const resultMessage = `🧹 Cron Cleanup: Purged ${purgedVoiceNotesCount} notes & ${purgedBroadcastsCount} broadcasts. Freed ${totalRefundBytes} bytes.`;
    console.log(resultMessage);
    
    return NextResponse.json({ message: resultMessage }, { status: 200 });

  } catch (error: unknown) {
    console.error('Cron Cleanup Error:', error);
    return NextResponse.json({ error: 'Failed to execute scheduled cleanup.' }, { status: 500 });
  }
}
