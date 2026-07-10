export function normalizeRollNo(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildRollNoRegex(value: unknown) {
  const normalizedRollNo = normalizeRollNo(value);
  return new RegExp(`^\\s*${escapeRegex(normalizedRollNo)}\\s*$`, 'i');
}