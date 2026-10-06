import { randomBytes, randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { hashResetGrant, hashResetOtp, passwordResetSecret, verifyResetOtp } from './passwordResetCredentials';

import connectToDatabase from '../mongodb';
import User from '../../models/User';
import { consumeRateLimitDimensions } from '../rateLimit';
import { hashPassword } from '../security/password';
import { isPortalActivityActorRole, recordPortalActivity } from '../portalActivityLog';
import { isEmailConfigured, sendNotificationEmail } from '../mailer';
import {
  parsePasswordResetCompletionInput,
  parsePasswordResetOtpInput,
  parsePasswordResetRequestInput,
  passwordResetAccountFilter,
} from './passwordResetValidation';

const MIN_REQUEST_DURATION_MS = 750;
const EMAIL_INTERVAL_MS = 2 * 60 * 1000;
const EMAIL_WAIT_MS = 24 * 60 * 60 * 1000;
const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESET_GRANT_EXPIRY_MS = 5 * 60 * 1000;
const INVALID_CODE = 'The code is invalid, expired, or has reached its attempt limit. Request a new code.';
const REQUEST_MESSAGE = 'If an eligible account exists, you will receive a reset code. Codes expire in 10 minutes. Allow two minutes between requests; after three emails, wait 24 hours.';

type PasswordResetServiceResult = { status: number; body: Record<string, unknown> };
const result = (status: number, body: Record<string, unknown>): PasswordResetServiceResult => ({ status, body });

export async function requestPasswordReset(
  input: unknown,
  headers: Headers
): Promise<PasswordResetServiceResult> {
  const startedAt = performance.now();
  const parsed = parsePasswordResetRequestInput(input);
  if (!parsed.ok) return result(400, { error: parsed.error });
  if (!isEmailConfigured() || !passwordResetSecret()) {
    return result(503, { error: 'Email recovery is temporarily unavailable.' });
  }
  await connectToDatabase();
  const { email } = parsed.value;
  const limit = await consumeRateLimitDimensions('reset-request', email, headers, 20);
  if (!limit.allowed) return result(429, { error: 'Too many requests. Please try again later.' });

  try {
    await dispatchPasswordReset(email);
  } catch {
    console.error('password_reset_delivery_failed');
  }
  // Keep fast missing/ineligible/cooldown paths comparable without detached work.
  // Slow SMTP is still awaited; the padding itself never exceeds 750 ms.
  const remaining = MIN_REQUEST_DURATION_MS - (performance.now() - startedAt);
  if (remaining > 0) await delay(remaining);
  return result(200, { message: REQUEST_MESSAGE });
}

async function dispatchPasswordReset(email: string) {
  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const resetCode = hashResetOtp(email, otp);
  const now = new Date();
  const waitBoundary = new Date(now.getTime() - EMAIL_WAIT_MS);
  // Claim the send and replace the code atomically, across all server instances.
  // Return the previous send counters so a failed SMTP send can refund its slot.
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
    // Pending codes cannot be verified before delivery succeeds.
    resetCodeExpiry: null,
  } }], { returnDocument: 'before', updatePipeline: true })
    .select('email +resetEmailCount +resetEmailSentAt');

  if (!user) return;
  const text = `Your FYP Portal password reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email. Do not share this code.`;
  let delivered = false;
  try {
    delivered = await sendNotificationEmail(user.email, 'FYP Portal password reset code', `<p>${text}</p>`, text);
  } catch {
    // Treat unexpected mailer exceptions exactly like an unsuccessful send.
  }
  if (delivered) {
    await User.updateOne({ _id: user._id, resetCode }, {
      $set: { resetCodeExpiry: new Date(Date.now() + OTP_EXPIRY_MS) },
    });
    return;
  }
  console.error('password_reset_delivery_failed');
  await User.updateOne({ _id: user._id, resetCode }, { $set: {
    resetCode: null,
    resetCodeExpiry: null,
    resetEmailCount: user.resetEmailCount ?? 0,
    resetEmailSentAt: user.resetEmailSentAt ?? null,
    resetAttempts: 0,
  } });
}

export async function verifyPasswordResetOtp(input: unknown, headers: Headers): Promise<PasswordResetServiceResult> {
  const parsed = parsePasswordResetOtpInput(input);
  if (!parsed.ok) return result(400, { error: parsed.error });
  if (!passwordResetSecret()) return result(503, { error: 'Email recovery is temporarily unavailable.' });
  await connectToDatabase();
  const { email, otp } = parsed.value;
  const limit = await consumeRateLimitDimensions('reset-verify', email, headers, 30);
  if (!limit.allowed) return result(429, { error: 'Too many attempts. Please try again later.' });

  // Reserve an attempt before comparing, so concurrent requests cannot bypass the limit.
  const user = await User.findOneAndUpdate({
    ...passwordResetAccountFilter(email),
    resetCode: { $regex: '^otp:v2:' },
    resetCodeExpiry: { $gt: new Date() },
    resetAttempts: { $lt: 5 },
  }, { $inc: { resetAttempts: 1 } }, { returnDocument: 'after' })
    .select('+resetCode +resetCodeExpiry +resetAttempts');
  if (!user || !verifyResetOtp(user.email, otp, user.resetCode)) {
    return result(400, { error: INVALID_CODE });
  }

  const resetToken = randomBytes(32).toString('hex');
  const grant = hashResetGrant(user.email, resetToken);
  const update = await User.updateOne({
    _id: user._id,
    ...passwordResetAccountFilter(email),
    resetCode: user.resetCode,
    $expr: { $gt: ['$resetCodeExpiry', '$$NOW'] },
  }, { $set: { resetCode: grant, resetCodeExpiry: new Date(Date.now() + RESET_GRANT_EXPIRY_MS) } });
  if (update.modifiedCount !== 1) return result(400, { error: INVALID_CODE });
  return result(200, { message: 'Code verified. Choose a new password within five minutes.', resetToken });
}

export async function completePasswordReset(input: unknown, headers: Headers): Promise<PasswordResetServiceResult> {
  const parsed = parsePasswordResetCompletionInput(input);
  if (!parsed.ok) return result(400, { error: parsed.error });
  if (!passwordResetSecret()) return result(503, { error: 'Email recovery is temporarily unavailable.' });
  await connectToDatabase();
  const { email, resetToken, newPassword } = parsed.value;
  const limit = await consumeRateLimitDimensions('reset-complete', email, headers, 30);
  if (!limit.allowed) return result(429, { error: 'Too many attempts. Please try again later.' });

  const grant = hashResetGrant(email, resetToken);
  const filter = { ...passwordResetAccountFilter(email), resetCode: grant, resetCodeExpiry: { $gt: new Date() } };
  const user = await User.findOne(filter).select('_id role name rollNo');
  const invalidGrant = { error: 'Recovery has expired or already been used. Request a new code.' };
  if (!user) return result(400, invalidGrant);
  const update = await User.updateOne({ _id: user._id, ...filter, $expr: { $gt: ['$resetCodeExpiry', '$$NOW'] } }, {
    $set: {
      password: await hashPassword(newPassword), resetCode: null, resetCodeExpiry: null,
      lastPasswordChange: new Date(),
    },
    $inc: { sessionVersion: 1 },
  });
  if (update.modifiedCount !== 1) return result(400, invalidGrant);

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
