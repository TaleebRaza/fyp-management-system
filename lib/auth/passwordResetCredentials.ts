import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function passwordResetSecret() {
  const secret = process.env.PASSWORD_RESET_SECRET || process.env.NEXTAUTH_SECRET;
  return secret && Buffer.byteLength(secret) >= 32 ? secret : null;
}

function digest(purpose: string, email: string, credential: string) {
  const secret = passwordResetSecret();
  if (!secret) throw new Error('Password reset secret is not configured.');
  return createHmac('sha256', secret).update(JSON.stringify([purpose, email, credential])).digest('hex');
}

export function hashResetOtp(email: string, otp: string) {
  const nonce = randomBytes(16).toString('hex');
  return `otp:v2:${nonce}:${digest('otp', email, `${nonce}:${otp}`)}`;
}

export function verifyResetOtp(email: string, otp: string, stored: string) {
  const match = /^otp:v2:([a-f0-9]{32}):([a-f0-9]{64})$/.exec(stored);
  if (!match) return false;
  const actual = digest('otp', email, `${match[1]}:${otp}`);
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(match[2], 'hex'));
}

export function hashResetGrant(email: string, token: string) {
  return `grant:v1:${digest('grant', email, token)}`;
}
