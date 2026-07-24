import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { buildRollNoRegex, normalizeRollNo } from '../../../../lib/rollNo';
import { isValidGmailAddress, normalizeGmailAddress } from '../../../../lib/studentIdentity';
import { sendNotificationEmail } from '../../../../lib/mailer';
import { consumeRateLimit, refundRateLimit } from '../../../../lib/rateLimit';

const PASSWORD_RESET_REQUEST_LIMIT = 5;
const PASSWORD_CHANGE_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const RESET_CODE_EXPIRY_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const { rollNo, email } = await req.json();
    const normalizedRollNo = normalizeRollNo(rollNo);
    const resetRecipientEmail = normalizeGmailAddress(email);

    if (!normalizedRollNo || !resetRecipientEmail) {
      return NextResponse.json({ error: 'Roll number and Gmail address are required.' }, { status: 400 });
    }

    if (!isValidGmailAddress(resetRecipientEmail)) {
      return NextResponse.json({ error: 'Enter a valid Gmail address ending in @gmail.com.' }, { status: 400 });
    }

    let user = await User.findOne({ rollNo: normalizedRollNo });
    if (!user) {
      user = await User.findOne({ rollNo: buildRollNoRegex(normalizedRollNo) });
    }

    if (!user) {
      return NextResponse.json(
        { message: 'If an account exists for that roll number, a reset code will be sent shortly.' },
        { status: 200 }
      );
    }

    if (user.lastPasswordChange) {
      const timeSinceLastChange = Date.now() - new Date(user.lastPasswordChange).getTime();
      if (timeSinceLastChange < PASSWORD_CHANGE_COOLDOWN_MS) {
        const hoursLeft = Math.ceil((PASSWORD_CHANGE_COOLDOWN_MS - timeSinceLastChange) / 3600000);
        return NextResponse.json(
          { error: `Password was changed recently. Please try again in ${hoursLeft} hours.` },
          { status: 429 }
        );
      }
    }

    if (user.resetCode && user.resetCodeExpiry && new Date(user.resetCodeExpiry).getTime() > Date.now()) {
      const minutesLeft = Math.ceil((new Date(user.resetCodeExpiry).getTime() - Date.now()) / 60000);
      return NextResponse.json(
        { error: `A reset code has already been sent. Please wait ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} before requesting a new code.` },
        { status: 429 }
      );
    }

    const rateLimitKey = `forgot-password:${normalizedRollNo.toLowerCase()}`;
    const rateLimit = await consumeRateLimit(rateLimitKey, PASSWORD_RESET_REQUEST_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many password reset requests. Please try again in an hour.' }, { status: 429 });
    }

    const code = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiry = new Date(Date.now() + RESET_CODE_EXPIRY_MS);

    await User.findByIdAndUpdate(user._id, { resetCode: codeHash, resetCodeExpiry: expiry });

    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; text-align: center;">
        <h2>Password Reset Request</h2>
        <p>Your one-time password reset code is:</p>
        <h1 style="letter-spacing: 4px; color: #10b981;">${code}</h1>
        <p>This code expires in 15 minutes. If you did not request it, ignore this email.</p>
      </div>
    `;

    const emailSent = await sendNotificationEmail(resetRecipientEmail, 'Your Password Reset Code', htmlContent);
    if (!emailSent) {
      await Promise.all([
        refundRateLimit(rateLimitKey),
        User.findByIdAndUpdate(user._id, { resetCode: null, resetCodeExpiry: null }),
      ]);
      return NextResponse.json({ error: 'Failed to send reset code. Please try again later.' }, { status: 500 });
    }

    return NextResponse.json({ message: 'A password reset code has been sent to the Gmail address you entered.' }, { status: 200 });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return NextResponse.json({ error: 'Failed to process request.' }, { status: 500 });
  }
}
