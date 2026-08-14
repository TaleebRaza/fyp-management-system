import mongoose from 'mongoose';
import { NextRequest, NextResponse } from 'next/server';

import { requireCurrentUser } from '../../../../lib/security/auth';
import { isRecord } from '../../../../lib/security/input';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const messages = await User.find({
    role: 'student',
    studentMessageId: { $type: 'string' },
    studentMessageCreatedAt: { $type: 'date' },
  })
    .select('_id name rollNo program studentMessageId studentMessageType studentMessageContent studentMessageSize studentMessageCreatedAt studentMessageAcknowledgedAt')
    .sort({ studentMessageCreatedAt: -1, _id: 1 })
    .lean();

  return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } });
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
