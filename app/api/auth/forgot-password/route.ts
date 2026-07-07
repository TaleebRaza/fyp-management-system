import { NextResponse } from 'next/server';
import connectToDatabase from '../../../../lib/mongodb';
import User from '../../../../models/User';
import { sendNotificationEmail } from '../../../../lib/mailer';
import { consumeRateLimit, refundRateLimit } from '../../../../lib/rateLimit';

const PASSWORD_RESET_REQUEST_LIMIT = 5;
const PASSWORD_CHANGE_COOLDOWN_MS = 5 * 60 * 60 * 1000;
const RESET_CODE_EXPIRY_MS = 15 * 60 * 1000;

export async function POST(req: Request) {
  try {
    await connectToDatabase();

    const { rollNo } = await req.json();
    const normalizedRollNo = String(rollNo || '').trim();

    if (!normalizedRollNo) {
      return NextResponse.json({ error: 'Roll Number is required.' }, { status: 400 });
    }

    const user = await User.findOne({ rollNo: normalizedRollNo });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.email) {
      return NextResponse.json({ error: 'No email attached to this account. Contact Admin.' }, { status: 400 });
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

    if (user.resetCode && user.resetCodeExpiry) {
      const resetCodeExpiryTime = new Date(user.resetCodeExpiry).getTime();

      if (resetCodeExpiryTime > Date.now()) {
        const minutesLeft = Math.ceil((resetCodeExpiryTime - Date.now()) / 60000);

        return NextResponse.json(
          { error: `A reset code has already been sent. Please wait ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} before requesting a new code.` },
          { status: 429 }
        );
      }
    }

    const rateLimitKey = `forgot-password:${normalizedRollNo.toLowerCase()}`;
    const rateLimit = await consumeRateLimit(rateLimitKey, PASSWORD_RESET_REQUEST_LIMIT);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many password reset requests. Please try again in an hour.' },
        { status: 429 }
      );
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + RESET_CODE_EXPIRY_MS);

    await User.findByIdAndUpdate(user._id, {
      resetCode: code,
      resetCodeExpiry: expiry,
    });

    const htmlContent = `
      <div style="font-family: sans-serif; padding: 20px; text-align: center;">
        <h2>Password Reset Request</h2>
        <p>Your one-time password reset code is:</p>
        <h1 style="letter-spacing: 4px; color: #10b981;">${code}</h1>
        <p>This code will expire in 15 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `;

    const emailSent = await sendNotificationEmail(user.email, 'Your Password Reset Code', htmlContent);

    if (!emailSent) {
      await refundRateLimit(rateLimitKey);

      return NextResponse.json(
        { error: 'Failed to send reset code. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'Code sent to your registered email!' }, { status: 200 });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}