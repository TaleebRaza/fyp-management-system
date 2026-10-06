import { randomInt } from 'node:crypto';
import User from '../../models/User';
import connectToDatabase from '../mongodb';
import { consumeRateLimitDimensions } from '../rateLimit';
import { isRecord, isValidEmailAddress, normalizeEmailAddress } from '../security/input';
import { verifyPassword } from '../security/password';
import { isEmailConfigured, sendNotificationEmail } from '../mailer';
import { hashResetOtp, passwordResetSecret, verifyResetOtp } from './passwordResetCredentials';

const DAY_MS = 24 * 60 * 60 * 1000;
const result = (status: number, body: Record<string, unknown>) => ({ status, body });

export async function updateStudentEmail(userId: string, input: unknown, headers: Headers) {
  if (!isRecord(input) || !['request', 'confirm'].includes(String(input.action))) {
    return result(400, { error: 'Invalid email change request.' });
  }
  const email = normalizeEmailAddress(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  const otp = typeof input.otp === 'string' ? input.otp.trim() : '';
  if (!isValidEmailAddress(email) || !email.endsWith('@student.uoh.edu.pk') || !password || password.length > 128
    || (input.action === 'confirm' && !/^\d{6}$/.test(otp))) {
    return result(400, { error: 'Enter your current password and a valid @student.uoh.edu.pk email. Confirmation requires a six-digit code.' });
  }
  if (!passwordResetSecret() || !isEmailConfigured()) return result(503, { error: 'Email verification is temporarily unavailable.' });
  await connectToDatabase();
  const limit = await consumeRateLimitDimensions(`student-email-${input.action}`, userId, headers, input.action === 'request' ? 5 : 20, input.action === 'request' ? 30 : 60);
  if (!limit.allowed) return result(429, { error: 'Too many attempts. Please try again later.' });
  const student = await User.findOne({ _id: userId, role: 'student', isActive: true })
    .select('email sessionVersion +password +pendingEmailChange +lastEmailChangeAt');
  if (!student) return result(401, { error: 'Student account unavailable.' });
  if (!(await verifyPassword(password, student.password)).matches) return result(400, { error: 'Current password is incorrect.' });
  if (student.email === email) return result(400, { error: 'This is already your assigned email.' });
  const now = new Date();
  const cutoff = new Date(now.getTime() - DAY_MS);
  const filter = {
    _id: userId, role: 'student', isActive: true, password: student.password,
    email: student.email ?? null,
    $and: [{ $or: [
      { sessionVersion: student.sessionVersion ?? 0 },
      ...(Number(student.sessionVersion ?? 0) === 0 ? [{ sessionVersion: null }] : []),
    ] }],
    $or: [{ lastEmailChangeAt: null }, { lastEmailChangeAt: { $lte: cutoff } }],
  };
  if (student.lastEmailChangeAt && new Date(student.lastEmailChangeAt).getTime() > cutoff.getTime()) {
    return result(429, { error: 'You can change your email once every 24 hours.' });
  }
  // Bind this OTP to its purpose, signed-in account, and proposed address.
  const identity = `email-change:${userId}:${email}`;
  if (input.action === 'request') {
    if (await User.exists({ email })) return result(409, { error: 'That email cannot be assigned to this account.' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const hashedCode = hashResetOtp(identity, code);
    const claimed = await User.findOneAndUpdate({ ...filter, $and: [...filter.$and, { $or: [
      { 'pendingEmailChange.sentAt': null },
      { 'pendingEmailChange.sentAt': { $lte: new Date(now.getTime() - 120_000) } },
    ] }] }, { $set: { pendingEmailChange: { email, code: hashedCode, expiresAt: null, attempts: 0, sentAt: now } } }, { returnDocument: 'after' });
    if (!claimed) return result(429, { error: 'Wait two minutes before requesting another code, or sign in again if your account changed.' });
    let delivered = false;
    const text = `Your FYP Portal email change code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.`;
    try { delivered = await sendNotificationEmail(email, 'FYP Portal email verification', `<p>${text}</p>`, text); } catch {}
    const pendingFilter = { _id: userId, 'pendingEmailChange.code': hashedCode };
    if (!delivered) {
      await User.updateOne(pendingFilter, { $unset: { pendingEmailChange: 1 } });
      console.error('student_email_verification_delivery_failed');
      return result(503, { error: 'Unable to send a verification code. Your assigned email has not changed.' });
    }
    await User.updateOne({ ...filter, ...pendingFilter }, { $set: { 'pendingEmailChange.expiresAt': new Date(Date.now() + 600_000) } });
    return result(200, { message: 'A code has been sent to your new email. Enter it within 10 minutes. Your assigned email stays unchanged until verification.' });
  }

  const claimed = await User.findOneAndUpdate({
    ...filter, 'pendingEmailChange.email': email, 'pendingEmailChange.attempts': { $lt: 5 },
    $expr: { $gt: ['$pendingEmailChange.expiresAt', '$$NOW'] },
  }, { $inc: { 'pendingEmailChange.attempts': 1 } }, { returnDocument: 'after' }).select('+pendingEmailChange');
  if (!claimed || !verifyResetOtp(identity, otp, claimed.pendingEmailChange.code)) {
    return result(400, { error: 'Code invalid, expired, or attempt limit reached. Request a new code.' });
  }
  try {
    const updated = await User.updateOne({
      ...filter, 'pendingEmailChange.email': email, 'pendingEmailChange.code': claimed.pendingEmailChange.code,
      $expr: { $gt: ['$pendingEmailChange.expiresAt', '$$NOW'] },
    }, {
      $set: { email, lastEmailChangeAt: new Date(), resetCode: null, resetCodeExpiry: null },
      $unset: { pendingEmailChange: 1 }, $inc: { sessionVersion: 1 },
    });
    if (updated.modifiedCount !== 1) return result(409, { error: 'Your account changed. Please sign in again and retry.' });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return result(409, { error: 'That email cannot be assigned to this account.' });
    throw error;
  }
  if (isValidEmailAddress(student.email)) {
    const text = 'Your FYP Portal account email has been changed. If you did not make this change, contact your portal administrator immediately.';
    try {
      if (!await sendNotificationEmail(student.email, 'FYP Portal account email changed', `<p>${text}</p>`, text)) console.error('student_email_change_notice_failed');
    } catch { console.error('student_email_change_notice_failed'); }
  }
  return result(200, { message: 'Email updated. Please sign in again. You can change it again after 24 hours.' });
}
