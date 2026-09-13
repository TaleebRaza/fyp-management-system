import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { ClientSession } from 'mongoose';

import { APP_SETTINGS } from '../../../../../config/appSettings';
import { consumeRateLimitDimensions } from '../../../../../lib/rateLimit';
import { requireCurrentUser } from '../../../../../lib/security/auth';
import { isRecord } from '../../../../../lib/security/input';
import { findSharedStorageKeys } from '../../../../../lib/storageReferenceSafety';
import {
  createStudentMessageId,
  getStaffReplySenderId,
  getStudentMessageDirection,
  isStaffReply,
  type StudentMessageRecipient,
} from '../../../../../lib/studentMessageDirection';
import {
  assertStorageLedgerReady,
  cancelUploadReservation,
  enqueueStorageDeletion,
  finalizeUploadReservation,
  StorageProtocolError,
  withStorageTransaction,
} from '../../../../../lib/storageProtocol';
import {
  getStorageObjectKind,
  isOwnedStudentMessageKey,
  normalizeStorageKey,
} from '../../../../../lib/storageValidation';
import User from '../../../../../models/User';
import Project from '../../../../../models/Project';

export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

function messageResponse(student: {
  studentMessageId?: unknown;
  studentMessageType?: unknown;
  studentMessageContent?: unknown;
  studentMessageSize?: unknown;
  studentMessageCreatedAt?: unknown;
  studentMessageAcknowledgedAt?: unknown;
} | null) {
  if (!student?.studentMessageId) return { message: null };
  const direction = getStudentMessageDirection(student.studentMessageId);

  return {
    message: {
      messageId: String(student.studentMessageId),
      type: student.studentMessageType,
      content: student.studentMessageContent,
      size: Number(student.studentMessageSize || 0),
      createdAt: student.studentMessageCreatedAt,
      acknowledgedAt: student.studentMessageAcknowledgedAt || null,
      recipient: direction?.kind === 'request'
        ? direction.recipient
        : direction?.kind === 'reply'
          ? direction.sender
          : 'admin',
      isStaffReply: direction?.kind === 'reply',
    },
  };
}

async function enqueueCurrentMessageDeletion(
  student: InstanceType<typeof User>,
  session: ClientSession,
  reason: string
) {
  if (student.studentMessageType !== 'audio' || !student.studentMessageContent) return;

  const key = normalizeStorageKey(student.studentMessageContent);
  if (
    !key
    || getStorageObjectKind(key) !== 'student-message'
    || !isOwnedStudentMessageKey(
      key,
      getStaffReplySenderId(student.studentMessageId) || String(student._id)
    )
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
        reason,
      },
      session
    );
  }
}

async function replaceCurrentMessage(
  studentId: string,
  nextMessage: {
    messageId: string;
    type: 'text' | 'audio';
    content: string;
    size: number;
    recipient: StudentMessageRecipient;
    supervisorId?: string;
  },
  session: ClientSession
) {
  const student = await User.findOne({ _id: studentId, role: 'student' }).session(session);
  if (!student) throw new StorageProtocolError('Student not found.', 404);
  if (nextMessage.recipient === 'supervisor') {
    if (!nextMessage.supervisorId) {
      throw new StorageProtocolError('Your assigned supervisor changed. Refresh and try again.', 409);
    }
    const assignment = await Project.exists({
      members: student._id,
      supervisorId: nextMessage.supervisorId,
    }).session(session);
    if (!assignment) {
      throw new StorageProtocolError('Your assigned supervisor changed. Refresh and try again.', 409);
    }
  }
  const currentIsStaffReply = isStaffReply(student.studentMessageId);
  if (student.studentMessageId && !currentIsStaffReply && !student.studentMessageAcknowledgedAt) {
    throw new StorageProtocolError('Your current message is still waiting for a response.', 409);
  }

  await enqueueCurrentMessageDeletion(student, session, 'student-message-replaced');
  const currentMessageGate = student.studentMessageId
    ? {
        studentMessageId: student.studentMessageId,
        ...(currentIsStaffReply ? {} : { studentMessageAcknowledgedAt: { $ne: null } }),
      }
    : {
        $or: [
          { studentMessageId: null },
          { studentMessageId: { $exists: false } },
        ],
      };
  const updated = await User.updateOne(
    { _id: student._id, role: 'student', ...currentMessageGate },
    {
      $set: {
        studentMessageId: nextMessage.messageId,
        studentMessageType: nextMessage.type,
        studentMessageContent: nextMessage.content,
        studentMessageSize: nextMessage.size,
        studentMessageCreatedAt: new Date(),
        studentMessageAcknowledgedAt: null,
      },
    },
    { session }
  );
  if (updated.modifiedCount !== 1) {
    throw new StorageProtocolError('Your message changed. Refresh and try again.', 409);
  }

  return await User.findById(student._id)
    .select('studentMessageId studentMessageType studentMessageContent studentMessageSize studentMessageCreatedAt studentMessageAcknowledgedAt')
    .session(session)
    .lean();
}

function audioMessageId(key: string) {
  return key.split('/').pop()?.replace(/\.webm$/, '') || '';
}

function isRecipient(value: unknown): value is StudentMessageRecipient {
  return value === 'admin' || value === 'supervisor';
}

async function resolveRecipient(
  studentId: string,
  recipient: StudentMessageRecipient
): Promise<{ recipient: StudentMessageRecipient; supervisorId?: string }> {
  if (recipient === 'admin') return { recipient };

  const project = await Project.findOne({ members: studentId, supervisorId: { $ne: null } })
    .select('supervisorId')
    .lean();
  const supervisorId = project?.supervisorId?.toString();
  if (!supervisorId) {
    throw new StorageProtocolError('You do not have an assigned supervisor.', 409);
  }
  return { recipient, supervisorId };
}

export async function GET(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['student']);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const student = await User.findById(currentUser.id)
    .select('studentMessageId studentMessageType studentMessageContent studentMessageSize studentMessageCreatedAt studentMessageAcknowledgedAt')
    .lean();
  return NextResponse.json(messageResponse(student), { headers: noStore });
}

export async function POST(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['student']);
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimit = await consumeRateLimitDimensions(
    'student-message-send',
    currentUser.id,
    req.headers,
    20
  );
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many message attempts. Please try again later.' }, { status: 429 });
  }

  let audioKey = '';
  try {
    const body: unknown = await req.json().catch(() => null);
    if (
      !isRecord(body)
      || (body.type !== 'text' && body.type !== 'audio')
      || !isRecipient(body.recipient)
    ) {
      return NextResponse.json({ error: 'Invalid message request.' }, { status: 400 });
    }
    const recipient = await resolveRecipient(currentUser.id, body.recipient);

    if (body.type === 'text') {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content || content.length > APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH) {
        return NextResponse.json(
          { error: `Message text must be 1-${APP_SETTINGS.STUDENT_MESSAGE.MAX_TEXT_LENGTH} characters.` },
          { status: 400 }
        );
      }

      const student = await withStorageTransaction((session) => replaceCurrentMessage(
        currentUser.id,
        {
          messageId: createStudentMessageId(
            recipient.recipient,
            randomUUID(),
            recipient.supervisorId
          ),
          type: 'text',
          content,
          size: 0,
          recipient: recipient.recipient,
          supervisorId: recipient.supervisorId,
        },
        session
      ));
      return NextResponse.json(messageResponse(student), { status: 201 });
    }

    audioKey = normalizeStorageKey(typeof body.key === 'string' ? body.key : '') || '';
    if (
      !audioKey
      || getStorageObjectKind(audioKey) !== 'student-message'
      || !isOwnedStudentMessageKey(audioKey, currentUser.id)
    ) {
      return NextResponse.json({ error: 'Invalid message audio upload.' }, { status: 400 });
    }

    const finalized = await finalizeUploadReservation({
      key: audioKey,
      ownerId: currentUser.id,
      kind: 'student-message',
      commit: (session, uploadedObject) => replaceCurrentMessage(
        currentUser.id,
        {
          messageId: createStudentMessageId(
            recipient.recipient,
            audioMessageId(audioKey),
            recipient.supervisorId
          ),
          type: 'audio',
          content: audioKey,
          size: uploadedObject.actualBytes,
          recipient: recipient.recipient,
          supervisorId: recipient.supervisorId,
        },
        session
      ),
    });
    const student = finalized.finalizedNow
      ? finalized.result
      : await User.findOne({
          _id: currentUser.id,
          role: 'student',
          studentMessageType: 'audio',
          studentMessageContent: audioKey,
        })
          .select('studentMessageId studentMessageType studentMessageContent studentMessageSize studentMessageCreatedAt studentMessageAcknowledgedAt')
          .lean();
    if (!student) {
      return NextResponse.json({ error: 'Message audio finalization is incomplete.' }, { status: 409 });
    }
    return NextResponse.json(messageResponse(student), { status: finalized.finalizedNow ? 201 : 200 });
  } catch (error) {
    if (audioKey && error instanceof StorageProtocolError && error.statusCode === 409) {
      await cancelUploadReservation(audioKey, currentUser.id, 'student-message-send-conflict');
    }
    console.error('student_message_send_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Unable to send the message.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const currentUser = await requireCurrentUser(req, ['student']);
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimit = await consumeRateLimitDimensions(
    'student-message-delete',
    currentUser.id,
    req.headers,
    20
  );
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many delete attempts. Please try again later.' }, { status: 429 });
  }

  try {
    const body: unknown = await req.json().catch(() => null);
    const messageId = isRecord(body) && typeof body.messageId === 'string'
      ? body.messageId.trim()
      : '';
    if (!messageId || messageId.length > 128) {
      return NextResponse.json({ error: 'A valid message ID is required.' }, { status: 400 });
    }

    await withStorageTransaction(async (session) => {
      const student = await User.findOne({
        _id: currentUser.id,
        role: 'student',
        studentMessageId: messageId,
      }).session(session);
      if (!student) throw new StorageProtocolError('The current message changed. Refresh and try again.', 409);
      if (isStaffReply(student.studentMessageId)) {
        throw new StorageProtocolError('Replies can be replaced by sending a new message.', 409);
      }

      await enqueueCurrentMessageDeletion(student, session, 'student-message-deleted');
      const cleared = await User.updateOne(
        { _id: student._id, role: 'student', studentMessageId: messageId },
        {
          $set: {
            studentMessageId: null,
            studentMessageType: null,
            studentMessageContent: null,
            studentMessageSize: 0,
            studentMessageCreatedAt: null,
            studentMessageAcknowledgedAt: null,
          },
        },
        { session }
      );
      if (cleared.modifiedCount !== 1) {
        throw new StorageProtocolError('The current message changed. Refresh and try again.', 409);
      }
    });

    return NextResponse.json({ message: null });
  } catch (error) {
    console.error('student_message_delete_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Unable to delete the message.' }, { status: 500 });
  }
}
