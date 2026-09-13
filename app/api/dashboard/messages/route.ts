import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';
import type { ClientSession } from 'mongoose';

import { APP_SETTINGS } from '../../../../config/appSettings';
import { consumeRateLimitDimensions } from '../../../../lib/rateLimit';
import { requireCurrentUser, type CurrentUser } from '../../../../lib/security/auth';
import { isRecord } from '../../../../lib/security/input';
import { findSharedStorageKeys } from '../../../../lib/storageReferenceSafety';
import {
  createStaffReplyId,
  getStaffReplySenderId,
  isMessageForStaff,
  isStaffReply,
  type StaffRole,
} from '../../../../lib/studentMessageDirection';
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
import Project from '../../../../models/Project';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

type StaffUser = CurrentUser & { role: StaffRole };

function asStaffUser(currentUser: CurrentUser | null): StaffUser | null {
  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'supervisor')) {
    return null;
  }
  return { ...currentUser, role: currentUser.role };
}

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
        reason: 'student-message-replied',
      },
      session
    );
  }
}

async function findMessageForStaff(
  staffUser: StaffUser,
  studentId: string,
  messageId: string,
  session?: ClientSession
) {
  const query = User.findOne({
    _id: studentId,
    role: 'student',
    studentMessageId: messageId,
  });
  if (session) query.session(session);
  const student = await query;
  if (!student || !isMessageForStaff(messageId, staffUser.role, staffUser.id)) return null;

  if (staffUser.role === 'supervisor') {
    const projectQuery = Project.exists({
      supervisorId: staffUser.id,
      members: student._id,
    });
    if (session) projectQuery.session(session);
    if (!await projectQuery) return null;
  }

  return student;
}

async function replaceStudentMessage(
  staffUser: StaffUser,
  studentId: string,
  messageId: string,
  reply: { messageId: string; type: 'text' | 'audio'; content: string; size: number },
  session: ClientSession
) {
  const student = await findMessageForStaff(staffUser, studentId, messageId, session);
  if (!student || isStaffReply(student.studentMessageId)) {
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

function messageListFilter(staffUser: StaffUser) {
  if (staffUser.role === 'supervisor') {
    return {
      studentMessageId: {
        $regex: new RegExp(`^to:supervisor:${staffUser.id}:`),
      },
    };
  }

  return {
    $or: [
      { studentMessageId: { $regex: /^to:admin:/ } },
      // Pre-routing student requests were all addressed to the admin.
      { studentMessageId: { $regex: /^[^:]+$/ } },
    ],
  };
}

async function addSupervisorProjectDetails(messages: Array<Record<string, unknown>>, supervisorId: string) {
  if (messages.length === 0) return messages;

  const studentIds = messages.map((message) => message._id);
  const projects = await Project.find({
    supervisorId,
    members: { $in: studentIds },
  })
    .select('_id members title')
    .lean();
  const projectByStudentId = new Map<string, { _id: unknown; title?: string }>();
  for (const project of projects) {
    for (const memberId of project.members || []) {
      projectByStudentId.set(memberId.toString(), project);
    }
  }

  return messages.flatMap((message) => {
    const project = projectByStudentId.get(String(message._id));
    return project
      ? [{ ...message, projectId: project._id, projectTitle: project.title || '' }]
      : [];
  });
}

export async function GET(req: NextRequest) {
  const staffUser = asStaffUser(await requireCurrentUser(req, ['admin', 'supervisor']));
  if (!staffUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const messages = await User.find({
    role: 'student',
    studentMessageCreatedAt: { $type: 'date' },
    ...messageListFilter(staffUser),
  })
    .select('_id name rollNo program studentMessageId studentMessageType studentMessageContent studentMessageSize studentMessageCreatedAt studentMessageAcknowledgedAt')
    .sort({ studentMessageCreatedAt: -1, _id: 1 })
    .lean() as Array<Record<string, unknown>>;
  const messagesWithProjects = staffUser.role === 'supervisor'
    ? await addSupervisorProjectDetails(messages, staffUser.id)
    : messages;

  return NextResponse.json(
    { messages: messagesWithProjects },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  const staffUser = asStaffUser(await requireCurrentUser(req, ['admin', 'supervisor']));
  if (!staffUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rateLimit = await consumeRateLimitDimensions(
    'staff-student-message-reply',
    staffUser.id,
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
        staffUser,
        studentId,
        messageId,
        {
          messageId: createStaffReplyId(staffUser.role, staffUser.id, randomUUID()),
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
      || !isOwnedStudentMessageKey(audioKey, staffUser.id)
    ) {
      return NextResponse.json({ error: 'Invalid reply audio upload.' }, { status: 400 });
    }

    const replyMessageId = createStaffReplyId(staffUser.role, staffUser.id, audioMessageId(audioKey));
    const finalized = await finalizeUploadReservation({
      key: audioKey,
      ownerId: staffUser.id,
      kind: 'student-message',
      commit: (session, uploadedObject) => replaceStudentMessage(
        staffUser,
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
      await cancelUploadReservation(audioKey, staffUser.id, 'student-message-reply-conflict');
    }
    console.error('student_message_reply_failed');
    if (error instanceof StorageProtocolError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Unable to send the reply.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const staffUser = asStaffUser(await requireCurrentUser(req, ['admin', 'supervisor']));
  if (!staffUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  const studentId = isRecord(body) && typeof body.studentId === 'string' ? body.studentId : '';
  const messageId = isRecord(body) && typeof body.messageId === 'string' ? body.messageId.trim() : '';
  if (!mongoose.Types.ObjectId.isValid(studentId) || !messageId || messageId.length > 128) {
    return NextResponse.json({ error: 'A valid student and message ID are required.' }, { status: 400 });
  }

  const student = await findMessageForStaff(staffUser, studentId, messageId);
  if (!student) {
    return NextResponse.json({ error: 'The current message changed. Refresh and try again.' }, { status: 409 });
  }

  const acknowledgedAt = new Date();
  const updated = await User.findOneAndUpdate(
    {
      _id: student._id,
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
    _id: student._id,
    role: 'student',
    studentMessageId: messageId,
    studentMessageAcknowledgedAt: { $ne: null },
  }).select('studentMessageAcknowledgedAt').lean();
  if (existing) return NextResponse.json({ acknowledgedAt: existing.studentMessageAcknowledgedAt });

  return NextResponse.json({ error: 'The current message changed. Refresh and try again.' }, { status: 409 });
}
