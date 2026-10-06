import { isValidEmailAddress, normalizeEmailAddress } from '../security/input';
import { validatePassword } from '../security/password';

type ParsedInput<T> = { ok: true; value: T } | { ok: false; error: string };

export function parsePasswordResetRequestInput(input: unknown): ParsedInput<{ email: string }> {
  const body = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const email = normalizeEmailAddress(body.email);
  return isValidEmailAddress(email)
    ? { ok: true, value: { email } }
    : { ok: false, error: 'Enter a valid registered email address.' };
}

export function parsePasswordResetOtpInput(input: unknown): ParsedInput<{ email: string; otp: string }> {
  const parsed = parsePasswordResetRequestInput(input);
  if (!parsed.ok) return parsed;
  const otp = String((input as Record<string, unknown>).otp || '').trim();
  return /^\d{6}$/.test(otp)
    ? { ok: true, value: { ...parsed.value, otp } }
    : { ok: false, error: 'Enter a six-digit code.' };
}

export function parsePasswordResetCompletionInput(input: unknown): ParsedInput<{
  email: string; resetToken: string; newPassword: string;
}> {
  const parsed = parsePasswordResetRequestInput(input);
  if (!parsed.ok) return parsed;
  const body = input as Record<string, unknown>;
  const resetToken = String(body.resetToken || '').trim();
  const newPassword = String(body.newPassword || '');
  if (!/^[a-f0-9]{64}$/.test(resetToken) || !validatePassword(newPassword)) {
    return { ok: false, error: 'Verify your code first and enter a password of 10 to 128 characters.' };
  }
  return { ok: true, value: { ...parsed.value, resetToken, newPassword } };
}

export function passwordResetAccountFilter(email: string) {
  return {
    email,
    isActive: true,
    role: { $in: email.endsWith('@student.uoh.edu.pk')
      ? ['student', 'supervisor', 'admin'] : ['supervisor', 'admin'] },
  };
}
