const MAX_STORAGE_KEY_LENGTH = 512;

export type StorageObjectKind = 'proposal' | 'voice' | 'broadcast';

const STORAGE_PREFIXES: Record<StorageObjectKind, string> = {
  proposal: 'proposals/',
  voice: 'voicenotes/',
  broadcast: 'broadcasts/',
};

function decodeStoragePath(value: string) {
  let decoded = value;

  // Decode twice so encoded traversal cannot survive as a literal "%2e%2e" segment.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }

  return decoded;
}

export function normalizeStorageKey(value: string | null) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  let path = rawValue;
  try {
    path = new URL(rawValue).pathname;
  } catch {}

  const key = decodeStoragePath(path)?.replace(/^\/+/, '');
  if (!key || key.length > MAX_STORAGE_KEY_LENGTH || key.includes('\\') || key.includes('\0')) {
    return null;
  }

  if (key.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return key;
}

export function getStorageObjectKind(key: string): StorageObjectKind | null {
  return (Object.entries(STORAGE_PREFIXES) as [StorageObjectKind, string][])
    .find(([, prefix]) => key.startsWith(prefix))?.[0] || null;
}
