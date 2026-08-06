export type StorageUploadKind = 'pdf' | 'voice' | 'broadcast';

const MAX_STORAGE_KEY_LENGTH = 500;

type StorageObjectKind = 'proposal' | 'voice' | 'broadcast';

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

export function isOwnedVoiceKey(key: unknown, userId: string, projectId: string) {
  return typeof key === 'string' && key.startsWith(`voicenotes/${userId}/${projectId}/`);
}

export function buildStorageKey(
  kind: StorageUploadKind,
  ownerId: string,
  objectId: string,
  projectId?: string
) {
  if (kind === 'pdf') return `proposals/${ownerId}/${objectId}.pdf`;
  if (kind === 'broadcast') return `broadcasts/${ownerId}/${objectId}.webm`;
  if (!projectId) throw new Error('Voice-note uploads require a project.');
  return `voicenotes/${ownerId}/${projectId}/${objectId}.webm`;
}

export function hasExpectedStorageMagic(kind: StorageUploadKind, bytes: Uint8Array) {
  if (kind === 'pdf') {
    return bytes.length >= 5
      && bytes[0] === 0x25
      && bytes[1] === 0x50
      && bytes[2] === 0x44
      && bytes[3] === 0x46
      && bytes[4] === 0x2d;
  }

  return bytes.length >= 4
    && bytes[0] === 0x1a
    && bytes[1] === 0x45
    && bytes[2] === 0xdf
    && bytes[3] === 0xa3;
}
