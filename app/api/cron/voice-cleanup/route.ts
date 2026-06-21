// app/api/cron/voice-cleanup/route.ts
import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import VoiceNote from '../../../../models/VoiceNote';
import { del } from '@vercel/blob';

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

    // Calculate the exact timestamp for 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // 2. Find ALL notes older than 24 hours (orphaned or expired)
    const expiredNotes = await VoiceNote.find({
      createdAt: { $lte: twentyFourHoursAgo }
    });

    if (expiredNotes.length === 0) {
      return NextResponse.json({ message: 'No expired voice notes to clean up.' }, { status: 200 });
    }

    // 3. Extract the Vercel Blob URLs
    const urlsToDelete = expiredNotes.map(note => note.blobUrl);

    // 4. Delete physical files from Vercel Blob first to protect the 1GB quota
    await del(urlsToDelete);

    // 5. Wipe the database ledgers only after files are confirmed deleted
    const idsToDelete = expiredNotes.map(note => note._id);
    await VoiceNote.deleteMany({ _id: { $in: idsToDelete } });

    console.log(`🧹 Scheduled Cron Cleanup: Purged ${expiredNotes.length} stale voice notes.`);
    return NextResponse.json({ 
      message: `Successfully purged ${expiredNotes.length} stale voice notes.` 
    }, { status: 200 });

  } catch (error: any) {
    console.error('Cron Cleanup Error:', error.message);
    return NextResponse.json({ error: 'Failed to execute scheduled cleanup.' }, { status: 500 });
  }
}