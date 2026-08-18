import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import type { ClientSession } from 'mongoose';

import { APP_SETTINGS } from '../../../../config/appSettings';
import { consumeRateLimitDimensions } from '../../../../lib/rateLimit';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { isRecord } from '../../../../lib/security/input';
import { findSharedStorageKeys } from '../../../../lib/storageReferenceSafety';
import { createAdminReplyId, isAdminReply } from '../../../../lib/studentMessageDirection';
import {
  assertStorageLedgerReady,
  cancelUploadReservation,
  enqueueStorageDeletion,
  finalizeUploadReservation,
  StorageProtocolError,
  withStorageTransaction,
} from '../../../../lib/storageProtocol';
import {
  getStorageObjectKind,
  isOwnedStudentMessageKey,
  normalizeStorageKey,
} from '../../../../lib/storageValidation';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

function audioMessageId(key: string) {
  return key.split('/').pop()?.replace(/\.webm$/, '') || '';
}

async function enqueueCurrentMessageDeletion(
  student: InstanceType<typeof User>,
  session: ClientSession
) {
  if (student.studentMessageType !== 'audio' || !student.studentMessageContent) return;

  const key = normalizeStorageKey(student.studentMessageContent);
  if (
    !key
    || getStorageObjectKind(key) !== 'student-message'
    || !isOwnedStudentMessageKey(key, String(student._id))
  ) {
    throw new StorageProtocolError(
      'The stored message audio key is invalid. Run the storage integrity audit before changing it.',
      409
    );
  }

  await assertStorageLedgerReady(session);
  const sharedKeys = await findSharedStorageKeys({
    keys: [key],
    excludedStudentIds: [student._id],
    session,
  });
  if (!sharedKeys.has(key)) {
    await enqueueStorageDeletion(
      {
        key,
        bytes: Number(student.studentMessageSize || 0),
        reason: 'student-message-replied',
      },
      session
    );
  }
}

async function replaceStudentMessage(
  studentId: string,
  messageId: string,
  reply: { messageId: string; type: 'text' | 'audio'; content: string; size: number },
  session: ClientSession
) {
  const student = await User.findOne({
    _id: studentId,
    role: 'student',
    studentMessageId: messageId,
  }).session(session);
  if (!student || isAdminReply(student.studentMessageId)) {
    throw new StorageProtocolError('The current message changed. Refresh and try again.', 409);
  }

  await enqueueCurrentMessageDeletion(student, session);
  const updated = await User.updateOne(
    { _id: student._id, role: 'student', studentMessageId: messageId },
    {
      $set: {
        studentMessageId: reply.messageId,
        studentMessageType: reply.type,
        studentMessageContent: reply.content,
        studentMessageSize: reply.size,
        studentMessageCreatedAt: new Date(),
        studentMessageAcknowledgedAt: null,
      },
    },
    { session }
  );
  if (updated.modifiedCount !== 1) {
    throw new StorageProtocolError('The current message changed. Refresh and try again.', 409);
  }
}

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const messages = await User.find({
    role: 'student',
    studentMessageId: { $regex: /^(?!admin:)/ },
    studentMessageCreatedAt: { $type: 'date' },
  })
    .select('_id name rollNo program studentMessageId studentMessageType studentMessageContent studentMessageSize studentMessageCreatedAt studentMessageAcknowledgedAt')
    .sort({ studentMessageCreatedAt: -1, _id: 1 })
    .lean();

  return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['admin']);
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimit = await consumeRateLimitDimensions(
    'admin-student-message-reply',
    currentUser.id,
    req.headers,
    20
  );
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many reply attempts. Please try again later.' }, { status: 429 });
  }

  let audioKey = '';
  try {
    const body: unknown = await req.json().catch(() => null);
    const studentId = isRecord(body) && typeof body.studentId === 'string' ? body.studentId : '';
    const messageId = isRecord(body) && typeof body.messageId === 'string' ? body.messageId.trim() : '';
    if (
      !isRecord(body)
      || !mongoose.Types.ObjectId.isValid(studentId)
      || !messageId
      || messageId.length > 128
      || (body.type !== 'text' && body.type !== 'audio')
    ) {
      return NextResponse.json({ error: 'Invalid reply request.' }, { status: 400 });
    }

    if (body.type === 'text') {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content || content.length > APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH) {
        return NextResponse.json(
          { error: `Reply text must be 1-${APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH} characters.` },
          { status: 400 }
        );
      }

      await withStorageTransaction((session) => replaceStudentMessage(
        studentId,
        messageId,
        {
          messageId: createAdminReplyId(currentUser.id, randomUUID()),
          type: 'text',
          content,
          size: 0,
        },
        session
      ));
      return NextResponse.json({ message: 'Reply sent.' }, { status: 201 });
    }

    audioKey = normalizeStorageKey(typeof body.key === 'string' ? body.key : '') || '';
    if (
      !audioKey
      || getStorageObjectKind(audioKey) !== 'student-message'
      || !isOwnedStudentMessageKey(audioKey, currentUser.id)
    ) {
      return NextResponse.json({ error: 'Invalid reply audio upload.' }, { status: 400 });
    }

    const replyMessageId = createAdminReplyId(currentUser.id, audioMessageId(audioKey));
    const finalized = await finalizeUploadReservation({
      key: audioKey,
      ownerId: currentUser.id,
      kind: 'student-message',
      commit: (session, uploadedObject) => replaceStudentMessage(
        studentId,
        messageId,
        {
          messageId: replyMessageId,
          type: 'audio',
          content: audioKey,
          size: uploadedObject.actualBytes,
        },
        session
      ),
    });
    if (!finalized.finalizedNow) {
      const reply = await User.exists({
        _id: studentId,
        role: 'student',
        studentMessageId: replyMessageId,
        studentMessageContent: audioKey,
      });
      if (!reply) {
        return NextResponse.json({ error: 'The current message changed. Refresh and try again.' }, { status: 409 });
      }
    }

    return NextResponse.json({ message: 'Reply sent.' }, { status: finalized.finalizedNow ? 201 : 200 });
  } catch (error) {
    if (audioKey && error instanceof StorageProtocolError && error.statusCode === 409) {
      await cancelUploadReservation(audioKey, currentUser.id, 'student-message-reply-conflict');
    }
    console.error('student_message_reply_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Unable to send the reply.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: unknown = await req.json().catch(() => null);
  const studentId = isRecord(body) && typeof body.studentId === 'string' ? body.studentId : '';
  const messageId = isRecord(body) && typeof body.messageId === 'string' ? body.messageId.trim() : '';
  if (!mongoose.Types.ObjectId.isValid(studentId) || !messageId || messageId.length > 128) {
    return NextResponse.json({ error: 'A valid student and message ID are required.' }, { status: 400 });
  }

  const acknowledgedAt = new Date();
  const updated = await User.findOneAndUpdate(
    {
      _id: studentId,
      role: 'student',
      studentMessageId: messageId,
      studentMessageAcknowledgedAt: null,
    },
    { $set: { studentMessageAcknowledgedAt: acknowledgedAt } },
    { new: true }
  )
    .select('_id studentMessageId studentMessageAcknowledgedAt')
    .lean();
  if (updated) return NextResponse.json({ acknowledgedAt: updated.studentMessageAcknowledgedAt });

  const existing = await User.findOne({
    _id: studentId,
    role: 'student',
    studentMessageId: messageId,
    studentMessageAcknowledgedAt: { $ne: null },
  }).select('studentMessageAcknowledgedAt').lean();
  if (existing) return NextResponse.json({ acknowledgedAt: existing.studentMessageAcknowledgedAt });

  return NextResponse.json({ error: 'The current message changed. Refresh and try again.' }, { status: 409 });
}
