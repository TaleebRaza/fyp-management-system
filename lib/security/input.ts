export function escapeHtml(value: unknown) {
  return String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character] || character));
}

export function normalizeText(value: unknown, maximumLength: number) {
  return String(value || '').trim().slice(0, maximumLength);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i;
const UNSUPPORTED_EMAIL_SYNTAX = /[()"<>,\r\n]/;

export function normalizeEmailAddress(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmailAddress(value: unknown) {
  const email = normalizeEmailAddress(value);
  return email.length <= 254
    && !UNSUPPORTED_EMAIL_SYNTAX.test(email)
    && EMAIL_PATTERN.test(email);
}
