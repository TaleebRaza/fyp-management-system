export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmailAddress(value: unknown) {
  return EMAIL_PATTERN.test(normalizeEmailAddress(value));
}
