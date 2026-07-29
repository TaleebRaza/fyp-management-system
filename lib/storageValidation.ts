export type StorageUploadKind = 'pdf' | 'voice' | 'broadcast';

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
