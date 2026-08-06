import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectToDatabase from '../../../lib/mongodb';
import VoiceNote from '../../../models/VoiceNote';
import { hasProjectAccess, requireCurrentUser } from '../../../lib/security/auth';
import { consumeRateLimitDimensions } from '../../../lib/rateLimit';
import { isOwnedVoiceKey } from '../../../lib/storageValidation';
import {
  assertStorageLedgerReady,
  enqueueStorageDeletion,
  finalizeUploadReservation,
  releaseVoiceNoteSlot,
  StorageProtocolError,
  withStorageTransaction,
} from '../../../lib/storageProtocol';

export const dynamic = 'force-dynamic';

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

    const notes = await VoiceNote.find({ projectId })
      .populate('senderId', 'name role')
      .sort({ createdAt: 1 })
      .lean();
    return NextResponse.json({ notes });
  } catch {
    console.error('voice_fetch_failed');
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req);
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimit = await consumeRateLimitDimensions('voice-finalize', currentUser.id, req.headers, 30);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many voice finalization attempts. Please try again later.' }, { status: 429 });
  }

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

    const finalized = await finalizeUploadReservation({
      key: blobUrl,
      ownerId: currentUser.id,
      kind: 'voice',
      projectId: String(projectId),
      commit: async (session, uploadedObject) => {
        const note = new VoiceNote({
          projectId,
          senderId: currentUser.id,
          blobUrl,
          fileSize: uploadedObject.actualBytes,
        });
        await note.save({ session });
        return note;
      },
    });
    const note = finalized.finalizedNow
      ? finalized.result
      : await VoiceNote.findOne({ blobUrl }).lean();
    if (!note) return NextResponse.json({ error: 'Voice note finalization is incomplete.' }, { status: 409 });

    return NextResponse.json(
      { message: 'Voice note saved', note },
      { status: finalized.finalizedNow ? 201 : 200 }
    );
  } catch (error) {
    console.error('voice_finalize_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
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
  } catch {
    console.error('voice_mark_played_failed');
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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

    const deleted = await withStorageTransaction(async (session) => {
      await assertStorageLedgerReady(session);
      const ownedNote = await VoiceNote.findOne({ _id: noteId, senderId: currentUser.id })
        .select('projectId blobUrl fileSize')
        .session(session);
      if (!ownedNote) return false;

      await enqueueStorageDeletion(
        { key: ownedNote.blobUrl, bytes: ownedNote.fileSize, reason: 'voice-deleted-by-sender' },
        session
      );
      await VoiceNote.deleteOne({ _id: ownedNote._id }, { session });
      await releaseVoiceNoteSlot(currentUser.id, ownedNote.projectId.toString(), session);
      return true;
    });
    if (!deleted) return NextResponse.json({ error: 'Voice note not found or access denied.' }, { status: 403 });

    return NextResponse.json({ message: 'Voice note deleted' });
  } catch (error) {
    console.error('voice_delete_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to delete voice note' }, { status: 500 });
  }
}
