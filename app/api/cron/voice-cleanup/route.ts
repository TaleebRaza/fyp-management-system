// app/api/cron/voice-cleanup/route.ts
import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import VoiceNote from '../../../../models/VoiceNote';
import User from '../../../../models/User';
import SystemConfig from '../../../../models/SystemConfig';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../../lib/s3-client';
import { hasValidCronAuthorization } from '../../../../lib/security/cron';

// Ensure Vercel never caches this route
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // 1. Strict Security Firewall: Only allow Vercel's Cron engine to execute this
  const authHeader = req.headers.get('authorization');
  
  if (!hasValidCronAuthorization(authHeader, process.env.CRON_SECRET)) {
    console.warn('Unauthorized cron execution attempt blocked.');
    return NextResponse.json({ error: 'Unauthorized access.' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    let totalRefundBytes = 0;
    let purgedVoiceNotesCount = 0;
    let purgedBroadcastsCount = 0;

    const now = Date.now();

    // ==========================================
    // TASK 1: CLEANUP ORPHANED VOICE NOTES (24 HRS)
    // ==========================================
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const expiredNotes = await VoiceNote.find({ createdAt: { $lte: twentyFourHoursAgo } });

    if (expiredNotes.length > 0) {
      purgedVoiceNotesCount = expiredNotes.length;
      
      // Calculate bytes being freed
      const notesSize = expiredNotes.reduce((sum, note) => sum + (note.fileSize || 0), 0);
      totalRefundBytes += notesSize;

      // Delete physical files from R2
      const urlsToDelete = expiredNotes.map(note => note.blobUrl);
      await Promise.all(urlsToDelete.map(key => 
        s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
      ).map(p => p.catch(e => console.error('R2 VoiceNote Deletion Error:', e.message))));

      // Wipe the database ledgers
      const idsToDelete = expiredNotes.map(note => note._id);
      await VoiceNote.deleteMany({ _id: { $in: idsToDelete } });
    }

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

    if (expiredBroadcasts.length > 0) {
      purgedBroadcastsCount = expiredBroadcasts.length;

      // Delete physical files from R2
      const broadcastKeys = expiredBroadcasts.map(user => {
        let key = user.broadcastContent;
        if (key.includes('.com/')) key = key.split('.com/')[1];
        return key;
      });

      await Promise.all(broadcastKeys.map(key => 
        s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
      ).map(p => p.catch(e => console.error('R2 Broadcast Deletion Error:', e.message))));

      // Accumulate ledger refund and prepare bulk update to clear User fields
      const bulkOps = expiredBroadcasts.map(user => {
        totalRefundBytes += (user.broadcastSize || 0);
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

    // ==========================================
    // TASK 3: MASTER LEDGER REFUND
    // ==========================================
    if (totalRefundBytes > 0) {
      await SystemConfig.findOneAndUpdate(
        { configKey: 'storage' },
        { $inc: { usedBytes: -totalRefundBytes } }
      );
    }

    const resultMessage = `🧹 Cron Cleanup: Purged ${purgedVoiceNotesCount} notes & ${purgedBroadcastsCount} broadcasts. Freed ${totalRefundBytes} bytes.`;
    console.log(resultMessage);
    
    return NextResponse.json({ message: resultMessage }, { status: 200 });

  } catch (error) {
    console.error('Cron Cleanup Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to execute scheduled cleanup.' }, { status: 500 });
  }
}
