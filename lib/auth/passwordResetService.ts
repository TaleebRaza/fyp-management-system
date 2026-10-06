import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

import connectToDatabase from '../mongodb';
import User from '../../models/User';
import { consumeRateLimitDimensions } from '../rateLimit';
import { hashPassword } from '../security/password';
import { isPortalActivityActorRole, recordPortalActivity } from '../portalActivityLog';
import { isEmailConfigured, sendNotificationEmail } from '../mailer';
import {
  parsePasswordResetCompletionInput,
  parsePasswordResetRequestInput,
  passwordResetAccountFilter,
} from './passwordResetValidation';

const EMAIL_INTERVAL_MS = 2 * 60 * 1000;
const EMAIL_WAIT_MS = 24 * 60 * 60 * 1000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_PREFIX = 'otp:v1:';
const INVALID_CODE = 'The code is invalid, expired, or has reached its attempt limit. Request a new code.';
const REQUEST_MESSAGE = 'If an eligible account exists, a reset code has been sent. Codes expire in 10 minutes. Allow two minutes between requests; after three emails, wait 24 hours.';

type PasswordResetServiceResult = { status: number; body: Record<string, unknown> };
const result = (status: number, body: Record<string, unknown>): PasswordResetServiceResult => ({ status, body });

export async function requestPasswordReset(input: unknown, headers: Headers): Promise<PasswordResetServiceResult> {
  const parsed = parsePasswordResetRequestInput(input);
  if (!parsed.ok) return result(400, { error: parsed.error });
  if (!isEmailConfigured()) return result(503, { error: 'Email recovery is temporarily unavailable.' });
  await connectToDatabase();
  const { email } = parsed.value;
  const limit = await consumeRateLimitDimensions('reset-request', email, headers, 20);
  if (!limit.allowed) return result(429, { error: 'Too many requests. Please try again later.' });

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const resetCode = OTP_PREFIX + await bcrypt.hash(otp, 10);
  const now = new Date();
  const waitBoundary = new Date(now.getTime() - EMAIL_WAIT_MS);
  // Claim the send and replace the code atomically, across all server instances.
  // Return the previous state so a failed SMTP send can safely refund its slot.
  const user = await User.findOneAndUpdate({
    ...passwordResetAccountFilter(email),
    $and: [
      { $or: [{ resetEmailSentAt: null }, { resetEmailSentAt: { $lte: new Date(now.getTime() - EMAIL_INTERVAL_MS) } }] },
      { $or: [{ resetEmailCount: { $lt: 3 } }, { resetEmailCount: null }, { resetEmailSentAt: { $lte: waitBoundary } }] },
    ],
  }, [{ $set: {
    resetEmailCount: { $cond: [
      { $lte: [{ $ifNull: ['$resetEmailSentAt', new Date(0)] }, waitBoundary] },
      1, { $add: [{ $ifNull: ['$resetEmailCount', 0] }, 1] },
    ] },
    resetEmailSentAt: now,
    resetAttempts: 0,
    resetCode,
    resetCodeExpiry: new Date(now.getTime() + OTP_EXPIRY_MS),
  } }], { returnDocument: 'before', updatePipeline: true })
    .select('+resetCode +resetCodeExpiry +resetEmailCount +resetEmailSentAt +resetAttempts');

  // Same response for missing, ineligible, and rate-limited accounts.
  if (!user) return result(200, { message: REQUEST_MESSAGE });
  const text = `Your FYP Portal password reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email. Do not share this code.`;
  const delivered = await sendNotificationEmail(email, 'FYP Portal password reset code', `<p>${text}</p>`, text);
  if (!delivered) {
    await User.updateOne({ _id: user._id, resetCode }, { $set: {
      resetCode: user.resetCode ?? null,
      resetCodeExpiry: user.resetCodeExpiry ?? null,
      resetEmailCount: user.resetEmailCount ?? 0,
      resetEmailSentAt: user.resetEmailSentAt ?? null,
      resetAttempts: user.resetAttempts ?? 0,
    } });
    return result(200, { message: REQUEST_MESSAGE });
  }
  return result(200, { message: REQUEST_MESSAGE });
}

export async function completePasswordReset(input: unknown, headers: Headers): Promise<PasswordResetServiceResult> {
  const parsed = parsePasswordResetCompletionInput(input);
  if (!parsed.ok) return result(400, { error: parsed.error });
  await connectToDatabase();
  const { email, otp, newPassword } = parsed.value;
  const limit = await consumeRateLimitDimensions('reset-verify', email, headers, 30);
  if (!limit.allowed) return result(429, { error: 'Too many attempts. Please try again later.' });

  // Reserve an attempt before comparing, so concurrent requests cannot bypass the limit.
  const user = await User.findOneAndUpdate({
    ...passwordResetAccountFilter(email),
    resetCode: { $regex: '^otp:v1:' },
    resetCodeExpiry: { $gt: new Date() },
    resetAttempts: { $lt: 5 },
  }, { $inc: { resetAttempts: 1 } }, { returnDocument: 'after' })
    .select('+resetCode +resetCodeExpiry +resetAttempts');
  if (!user || !await bcrypt.compare(otp, user.resetCode.slice(OTP_PREFIX.length))) {
    return result(400, { error: INVALID_CODE });
  }

  const update = await User.updateOne({
    _id: user._id,
    ...passwordResetAccountFilter(email),
    resetCode: user.resetCode,
    resetCodeExpiry: { $gt: new Date() },
  }, {
    $set: {
      password: await hashPassword(newPassword),
      resetCode: null,
      resetCodeExpiry: null,
      lastPasswordChange: new Date(),
    },
    $inc: { sessionVersion: 1 },
  });
  if (update.modifiedCount !== 1) return result(400, { error: INVALID_CODE });

  if (isPortalActivityActorRole(user.role)) {
    try {
      await recordPortalActivity({
        action: 'password-changed', actorId: user._id.toString(), actorRole: user.role,
        actorName: user.name, actorRollNo: user.rollNo,
      });
    } catch {
      console.error('password_reset_activity_record_failed');
    }
  }
  return result(200, { message: 'Password successfully updated! You can now log in.' });
}
