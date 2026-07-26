import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { buildRollNoRegex, normalizeRollNo } from '../../../../lib/rollNo';
import { consumeRateLimit } from '../../../../lib/rateLimit';
import { validatePassword } from '../../../../lib/security/password';

const PASSWORD_RESET_ATTEMPT_LIMIT = 10;
const INVALID_TOKEN_ERROR = 'Account recovery has expired. Verify your details again.';

export async function POST(req: Request) {
  try {
    const { rollNo, resetToken, newPassword } = await req.json();
    const normalizedRollNo = normalizeRollNo(rollNo);
    const normalizedResetToken = String(resetToken || '').trim().toLowerCase();
    const normalizedPassword = String(newPassword || '');

    if (!normalizedRollNo || !/^[a-f0-9]{64}$/.test(normalizedResetToken) || !validatePassword(normalizedPassword)) {
      return NextResponse.json(
        { error: 'A verified recovery request and a password of 10 to 128 characters are required.' },
        { status: 400 }
      );
    }

    await connectToDatabase();

    const rateLimitKey = `reset-password:${normalizedRollNo.toLowerCase()}`;
    const rateLimit = await consumeRateLimit(rateLimitKey, PASSWORD_RESET_ATTEMPT_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many password reset attempts. Please try again in an hour.' }, { status: 429 });
    }

    let user = await User.findOne({ role: 'student', rollNo: normalizedRollNo });
    if (!user) {
      user = await User.findOne({ role: 'student', rollNo: buildRollNoRegex(normalizedRollNo) });
    }

    if (
      !user
      || !user.resetCode
      || !user.resetCodeExpiry
      || new Date(user.resetCodeExpiry).getTime() <= Date.now()
      || !await bcrypt.compare(normalizedResetToken, user.resetCode)
    ) {
      return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    const updateResult = await User.updateOne(
      {
        _id: user._id,
        role: 'student',
        resetCode: user.resetCode,
        resetCodeExpiry: { $gt: new Date() },
      },
      {
        $set: {
          password: hashedPassword,
          resetCode: null,
          resetCodeExpiry: null,
          lastPasswordChange: new Date(),
        },
      }
    );

    if (updateResult.modifiedCount !== 1) {
      return NextResponse.json({ error: INVALID_TOKEN_ERROR }, { status: 400 });
    }

    return NextResponse.json({ message: 'Password successfully updated! You can now log in.' });
  } catch (error) {
    console.error('Password reset error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 });
  }
}
