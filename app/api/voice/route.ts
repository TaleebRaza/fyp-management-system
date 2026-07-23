import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import connectToDatabase from '../../../lib/mongodb';
import { s3Client, BUCKET_NAME } from '../../../lib/s3-client';
import SystemConfig from '../../../models/SystemConfig';
import VoiceNote from '../../../models/VoiceNote';
import { hasProjectAccess, requireCurrentUser } from '../../../lib/security/auth';
import { isOwnedVoiceKey } from '../../../lib/security/voice';

export const dynamic = 'force-dynamic';

const MAX_VOICE_NOTE_BYTES = 1024 * 1024;

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser(req);
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId || !mongoose.Types.ObjectId.isValid(projectId)) {
    return NextResponse.json({ error: 'Project ID required' }, { status: 400 });
  }

  try {
    await connectToDatabase();
    if (!await hasProjectAccess(currentUser, projectId)) {
      return NextResponse.json({ error: 'Project not found or access denied.' }, { status: 403 });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const expiredNotes = await VoiceNote.find({
        projectId,
        isPlayed: true,
        playedAt: { $lte: tenMinutesAgo },
      }).session(session);

      if (expiredNotes.length > 0) {
        const totalSize = expiredNotes.reduce((sum, note) => sum + (note.fileSize || 0), 0);
        await Promise.all(expiredNotes.map((note) =>
          s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: note.blobUrl }))
        ));
        await VoiceNote.deleteMany({ _id: { $in: expiredNotes.map((note) => note._id) } }).session(session);

        if (totalSize > 0) {
          await SystemConfig.findOneAndUpdate(
            { configKey: 'storage' },
            { $inc: { usedBytes: -totalSize } },
            { session }
          );
        }
      }

      await session.commitTransaction();
      session.endSession();

      const notes = await VoiceNote.find({ projectId })
        .populate('senderId', 'name role')
        .sort({ createdAt: 1 })
        .lean();
      return NextResponse.json({ notes });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error('Voice Fetch Error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req);
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { projectId, blobUrl } = await req.json();
    if (!projectId || !mongoose.Types.ObjectId.isValid(String(projectId)) ||
      !isOwnedVoiceKey(blobUrl, currentUser.id, String(projectId))) {
      return NextResponse.json({ error: 'Invalid voice note upload.' }, { status: 400 });
    }

    await connectToDatabase();
    if (!await hasProjectAccess(currentUser, String(projectId))) {
      return NextResponse.json({ error: 'Project not found or access denied.' }, { status: 403 });
    }

    const object = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: blobUrl }));
    const fileSize = object.ContentLength;
    if (!fileSize || fileSize > MAX_VOICE_NOTE_BYTES || !object.ContentType?.startsWith('audio/webm')) {
      return NextResponse.json({ error: 'Uploaded voice note is invalid.' }, { status: 400 });
    }

    const note = await new VoiceNote({
      projectId,
      senderId: currentUser.id,
      blobUrl,
      fileSize,
    }).save();

    await SystemConfig.findOneAndUpdate(
      { configKey: 'storage' },
      { $inc: { usedBytes: fileSize } },
      { upsert: true }
    );

    return NextResponse.json({ message: 'Voice note saved', note }, { status: 201 });
  } catch (error) {
    console.error('Voice POST Error:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const currentUser = await requireCurrentUser(req);
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { noteId } = await req.json();
    if (!mongoose.Types.ObjectId.isValid(String(noteId))) {
      return NextResponse.json({ error: 'Invalid voice note.' }, { status: 400 });
    }

    await connectToDatabase();
    const note = await VoiceNote.findById(noteId).select('projectId').lean();
    if (!note || !await hasProjectAccess(currentUser, note.projectId.toString())) {
      return NextResponse.json({ error: 'Voice note not found or access denied.' }, { status: 403 });
    }

    const updatedNote = await VoiceNote.findByIdAndUpdate(
      noteId,
      { isPlayed: true, playedAt: new Date() },
      { new: true }
    );
    return NextResponse.json({ message: 'Note marked as played', note: updatedNote });
  } catch (error) {
    console.error('Voice PATCH Error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}
