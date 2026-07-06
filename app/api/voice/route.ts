import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../lib/mongodb';
import VoiceNote from '../../../models/VoiceNote';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../lib/s3-client';

export const dynamic = 'force-dynamic';

// 1. FETCH & LAZY GARBAGE COLLECTION
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    
    if (!projectId) return NextResponse.json({ error: 'Project ID required' }, { status: 400 });

    // --- LAZY GARBAGE COLLECTION ENGINE ---
    // Calculate the exact timestamp for 10 minutes ago
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    // Find all notes for this project that have expired
    const expiredNotes = await VoiceNote.find({
      projectId,
      isPlayed: true,
      playedAt: { $lte: tenMinutesAgo }
    });

    if (expiredNotes.length > 0) {
      // 1. Delete physical files from R2 to save storage quota
      const urlsToDelete = expiredNotes.map(note => note.blobUrl);
      await Promise.all(urlsToDelete.map(key => 
        s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
      ));

      // 2. Wipe the database ledgers
      const idsToDelete = expiredNotes.map(note => note._id);
      await VoiceNote.deleteMany({ _id: { $in: idsToDelete } });
      
      console.log(`🧹 Garbage Collection: Purged ${expiredNotes.length} expired voice notes.`);
    }
    // --------------------------------------

    // Fetch the remaining valid notes
    const activeNotes = await VoiceNote.find({ projectId })
      .populate('senderId', 'name role')
      .sort({ createdAt: 1 })
      .lean();

    return NextResponse.json({ notes: activeNotes }, { status: 200 });
  } catch (error) {
    console.error('Voice Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

import SystemConfig from '../../../models/SystemConfig';

// 2. SAVE NEW NOTE LEDGER
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { projectId, senderId, blobUrl, fileSize } = await req.json();

    if (!projectId || !senderId || !blobUrl) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const newNote = new VoiceNote({ projectId, senderId, blobUrl });
    await newNote.save();

    // Increment our safety buffer ledger instantly
    if (fileSize) {
      await SystemConfig.findOneAndUpdate(
        { configKey: 'storage' }, 
        { $inc: { usedBytes: fileSize } }, 
        { upsert: true }
      );
    }

    return NextResponse.json({ message: 'Voice note ledger saved', note: newNote }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}

// 3. MARK AS PLAYED (Starts the 10-Minute Timer)
export async function PATCH(req: NextRequest) {
  try {
    await connectToDatabase();
    const { noteId } = await req.json();

    const updatedNote = await VoiceNote.findByIdAndUpdate(
      noteId,
      { isPlayed: true, playedAt: new Date() },
      { new: true }
    );

    return NextResponse.json({ message: 'Note marked as played', note: updatedNote }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}