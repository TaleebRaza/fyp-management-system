export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GMAIL_EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i;

export function normalizeEmailAddress(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmailAddress(value: unknown) {
  return EMAIL_PATTERN.test(normalizeEmailAddress(value));
}

export function normalizeGmailAddress(value: unknown) {
  return normalizeEmailAddress(value);
}

export function isValidGmailAddress(value: unknown) {
  return GMAIL_EMAIL_PATTERN.test(normalizeGmailAddress(value));
}
