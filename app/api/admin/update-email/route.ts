import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

    if (!token || token.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    await connectToDatabase();

    const { targetUserId, newEmail } = await req.json();
    const cleanedEmail = String(newEmail || '').trim().toLowerCase();

    if (!targetUserId) {
      return NextResponse.json({ error: 'Student or supervisor ID is required.' }, { status: 400 });
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
      targetUserId,
      { $set: { email: cleanedEmail } },
      { new: true, runValidators: true }
    )
      .select('_id name email role')
      .lean();

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

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
  } catch (error) {
    console.error('Update Email Error:', error);
    return NextResponse.json({ error: 'Failed to update email.' }, { status: 500 });
  }
}