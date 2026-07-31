export const ROLL_NO_FORMAT = 'F/S followed by two digits, a hyphen, and four digits';
export const ROLL_NO_EXAMPLE = 'F23-0201';

const ROLL_NO_PATTERN = /^[FS]\d{2}-\d{4}$/;

export function normalizeRollNo(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export function isValidRollNo(value: unknown) {
  return ROLL_NO_PATTERN.test(normalizeRollNo(value));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRollNoRegex(value: unknown) {
  const normalizedRollNo = normalizeRollNo(value);
  return new RegExp(`^\\s*${escapeRegex(normalizedRollNo)}\\s*$`, 'i');
}
