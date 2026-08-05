import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { requireCurrentUser } from '../../../../lib/security/auth';
import mongoose from 'mongoose';
import { recordPortalActivity } from '../../../../lib/portalActivityLog';

export const dynamic = 'force-dynamic';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['admin']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    await connectToDatabase();

    const { targetUserId, newEmail } = await req.json();
    const cleanedEmail = String(newEmail || '').trim().toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
      return NextResponse.json({ error: 'A valid student or supervisor ID is required.' }, { status: 400 });
    }

    if (!cleanedEmail || !isValidEmail(cleanedEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const emailExists = await User.findOne({
      email: cleanedEmail,
      _id: { $ne: targetUserId },
    }).select('_id').lean();

    if (emailExists) {
      return NextResponse.json({ error: 'This email is already in use.' }, { status: 400 });
    }

    const updatedUser = await User.findByIdAndUpdate(
      { _id: targetUserId, role: { $in: ['student', 'supervisor'] } },
      { $set: { email: cleanedEmail } },
      { new: true, runValidators: true }
    )
      .select('_id name email role')
      .lean();

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    await recordPortalActivity({
      action: updatedUser.role === 'supervisor'
        ? 'admin-supervisor-updated'
        : 'admin-student-updated',
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json(
      {
        message: 'Email updated successfully.',
        user: updatedUser,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch {
    console.error('update_email_failed');
    return NextResponse.json({ error: 'Failed to update email.' }, { status: 500 });
  }
}
