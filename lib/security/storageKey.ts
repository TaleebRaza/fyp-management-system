export function normalizeStorageKey(value: string | null) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  let key = rawValue;
  try {
    key = decodeURIComponent(new URL(rawValue).pathname);
  } catch {
    try {
      key = decodeURIComponent(rawValue);
    } catch {
      return null;
    }
  }

  key = key.replace(/^\/+/, '');
  if (!key || key.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return key;
}
