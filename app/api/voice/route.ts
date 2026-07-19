import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectToDatabase from '../../../lib/mongodb';
import Project from '../../../models/Project';
import SystemConfig from '../../../models/SystemConfig';
import VoiceNote from '../../../models/VoiceNote';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME } from '../../../lib/s3-client';
import mongoose from 'mongoose';


export const dynamic = 'force-dynamic';

type ProjectAccessRecord = {
  members?: unknown[];
  supervisorId?: unknown;
};

function canAccessVoiceProject(
  project: ProjectAccessRecord | null,
  userId: string,
  role: unknown
) {
  return (
    (role === 'student' && project?.members?.some(member => String(member) === userId)) ||
    (role === 'supervisor' && String(project?.supervisorId ?? '') === userId)
  );
}

// 1. FETCH & LAZY GARBAGE COLLECTION
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'student' && token.role !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
    }

    await connectToDatabase();
    const project = await Project.findById(projectId)
      .select('members supervisorId')
      .lean();
    const userId = String(token.id);
    if (!canAccessVoiceProject(project, userId, token.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // --- LAZY GARBAGE COLLECTION ENGINE ---
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

      // Find expired notes for this project
      const expiredNotes = await VoiceNote.find({
        projectId,
        isPlayed: true,
        playedAt: { $lte: tenMinutesAgo }
      }).session(session);

      if (expiredNotes.length > 0) {
        // 1. Sum the file sizes
        const totalSize = expiredNotes.reduce((sum, note) => sum + (note.fileSize || 0), 0);

        // 2. Delete physical files from R2
        const urlsToDelete = expiredNotes.map(note => note.blobUrl);
        await Promise.all(urlsToDelete.map(key => 
          s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
        ));

        // 3. Delete the database documents
        const idsToDelete = expiredNotes.map(note => note._id);
        await VoiceNote.deleteMany({ _id: { $in: idsToDelete } }).session(session);

        // 4. Decrement the storage ledger
        if (totalSize > 0) {
          await SystemConfig.findOneAndUpdate(
            { configKey: 'storage' },
            { $inc: { usedBytes: -totalSize } },
            { session }
          );
        }

        console.log(`🧹 Garbage Collection: Purged ${expiredNotes.length} expired voice notes, freed ${totalSize} bytes.`);
      }

      await session.commitTransaction();
      session.endSession();

      // Fetch the remaining valid notes
      const activeNotes = await VoiceNote.find({ projectId })
        .populate('senderId', 'name role')
        .sort({ createdAt: 1 })
        .lean();

      return NextResponse.json({ notes: activeNotes }, { status: 200 });

    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }

  } catch (error) {
    console.error('Voice Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

// 2. SAVE NEW NOTE LEDGER
// app/api/voice/route.ts (POST handler only – replace the whole POST function)

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'student' && token.role !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { projectId, senderId, blobUrl, fileSize } = await req.json();

    // Validate all required fields, including fileSize
    if (!projectId || !senderId || !blobUrl || typeof fileSize !== 'number') {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, senderId, blobUrl, fileSize (must be a number)' },
        { status: 400 }
      );
    }

    const userId = String(token.id);
    if (String(senderId) !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await connectToDatabase();
    const project = await Project.findById(projectId)
      .select('members supervisorId')
      .lean();

    if (!canAccessVoiceProject(project, userId, token.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const newNote = new VoiceNote({ projectId, senderId: userId, blobUrl, fileSize });
    await newNote.save();

    // Increment the storage ledger
    await SystemConfig.findOneAndUpdate(
      { configKey: 'storage' },
      { $inc: { usedBytes: fileSize } },
      { upsert: true }
    );

    return NextResponse.json({ message: 'Voice note ledger saved', note: newNote }, { status: 201 });
  } catch (error) {
    console.error('Voice POST Error:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}

// 3. MARK AS PLAYED (Starts the 10-Minute Timer)
export async function PATCH(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (token.role !== 'student' && token.role !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { noteId } = await req.json();
    if (!noteId) {
      return NextResponse.json({ error: 'Note ID required' }, { status: 400 });
    }

    await connectToDatabase();
    const note = await VoiceNote.findById(noteId).select('projectId').lean();
    if (!note?.projectId) {
      return NextResponse.json({ error: 'Voice note not found' }, { status: 404 });
    }

    const project = await Project.findById(note.projectId)
      .select('members supervisorId')
      .lean();

    if (!canAccessVoiceProject(project, String(token.id), token.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updatedNote = await VoiceNote.findByIdAndUpdate(
      noteId,
      { isPlayed: true, playedAt: new Date() },
      { new: true }
    );

    return NextResponse.json({ message: 'Note marked as played', note: updatedNote }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}
