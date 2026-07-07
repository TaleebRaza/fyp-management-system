import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import bcrypt from 'bcryptjs';
import { consumeRateLimit } from '../../../../lib/rateLimit';

const PASSWORD_RESET_ATTEMPT_LIMIT = 10;

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const { rollNo, code, newPassword } = await req.json();

    const normalizedRollNo = String(rollNo || '').trim();
    const normalizedCode = String(code || '').trim();
    const normalizedPassword = String(newPassword || '');

    if (!normalizedRollNo) {
      return NextResponse.json({ error: 'Roll Number is required.' }, { status: 400 });
    }

    if (!normalizedCode) {
      return NextResponse.json({ error: 'Reset code is required.' }, { status: 400 });
    }

    if (!normalizedPassword) {
      return NextResponse.json({ error: 'New password is required.' }, { status: 400 });
    }

    const rateLimitKey = `reset-password:${normalizedRollNo.toLowerCase()}`;
    const rateLimit = await consumeRateLimit(rateLimitKey, PASSWORD_RESET_ATTEMPT_LIMIT);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset attempts. Please try again in an hour.' },
        { status: 429 }
      );
    }

    const user = await User.findOne({ rollNo: normalizedRollNo });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.resetCode || user.resetCode !== normalizedCode) {
      return NextResponse.json({ error: 'Invalid reset code' }, { status: 400 });
    }

    if (!user.resetCodeExpiry || new Date() > new Date(user.resetCodeExpiry)) {
      return NextResponse.json({ error: 'Code has expired' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);

    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      resetCode: null,
      resetCodeExpiry: null,
      lastPasswordChange: new Date(),
    });

    return NextResponse.json({ message: 'Password successfully updated! You can now log in.' }, { status: 200 });
  } catch (error: any) {
    console.error('Password reset error:', error.message);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}