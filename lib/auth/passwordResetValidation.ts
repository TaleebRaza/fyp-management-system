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

export function parsePasswordResetCompletionInput(input: unknown): ParsedInput<{
  email: string; otp: string; newPassword: string;
}> {
  const parsed = parsePasswordResetRequestInput(input);
  if (!parsed.ok) return parsed;
  const body = input as Record<string, unknown>;
  const otp = String(body.otp || '').trim();
  const newPassword = String(body.newPassword || '');
  if (!/^\d{6}$/.test(otp) || !validatePassword(newPassword)) {
    return { ok: false, error: 'Enter a six-digit code and a password of 10 to 128 characters.' };
  }
  return { ok: true, value: { ...parsed.value, otp, newPassword } };
}

export function passwordResetAccountFilter(email: string) {
  return {
    email,
    isActive: true,
    role: { $in: email.endsWith('@student.uoh.edu.pk')
      ? ['student', 'supervisor', 'admin'] : ['supervisor', 'admin'] },
  };
}
