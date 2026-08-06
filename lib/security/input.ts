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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

export function isValidEmailAddress(value: unknown) {
  return EMAIL_PATTERN.test(normalizeEmailAddress(value));
}
