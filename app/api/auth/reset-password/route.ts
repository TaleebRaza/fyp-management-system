import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { buildRollNoRegex, normalizeRollNo } from '../../../../lib/rollNo';
import { consumeRateLimit } from '../../../../lib/rateLimit';

const PASSWORD_RESET_ATTEMPT_LIMIT = 10;
const MIN_PASSWORD_LENGTH = 6;

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const { rollNo, code, newPassword } = await req.json();
    const normalizedRollNo = normalizeRollNo(rollNo);
    const normalizedCode = String(code || '').trim();
    const normalizedPassword = String(newPassword || '');

    if (!normalizedRollNo || !/^\d{6}$/.test(normalizedCode) || normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Roll number, a valid 6-digit code, and a password of at least ${MIN_PASSWORD_LENGTH} characters are required.` },
        { status: 400 }
      );
    }

    const rateLimitKey = `reset-password:${normalizedRollNo.toLowerCase()}`;
    const rateLimit = await consumeRateLimit(rateLimitKey, PASSWORD_RESET_ATTEMPT_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many password reset attempts. Please try again in an hour.' }, { status: 429 });
    }

    let user = await User.findOne({ rollNo: normalizedRollNo });
    if (!user) user = await User.findOne({ rollNo: buildRollNoRegex(normalizedRollNo) });
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    if (!user.resetCode || !user.resetCodeExpiry || new Date(user.resetCodeExpiry).getTime() <= Date.now()) {
      return NextResponse.json({ error: 'Reset code is invalid or has expired.' }, { status: 400 });
    }

    const codeMatches = await bcrypt.compare(normalizedCode, user.resetCode);
    if (!codeMatches) {
      return NextResponse.json({ error: 'Reset code is invalid or has expired.' }, { status: 400 });
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
    console.error('Password reset error:', error?.message || error);
    return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 });
  }
}
