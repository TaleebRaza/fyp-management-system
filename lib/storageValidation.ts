export type StorageUploadKind = 'pdf' | 'voice' | 'broadcast' | 'fine-proof';

export function buildStorageKey(
  kind: StorageUploadKind,
  ownerId: string,
  objectId: string,
  projectId?: string
) {
  if (kind === 'pdf') return `proposals/${ownerId}/${objectId}.pdf`;
  if (kind === 'broadcast') return `broadcasts/${ownerId}/${objectId}.webm`;
  if (kind === 'fine-proof') return `fine-proofs/${ownerId}/${objectId}`;
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

  if (kind === 'fine-proof') {
    const pdf = bytes.length >= 5
      && bytes[0] === 0x25
      && bytes[1] === 0x50
      && bytes[2] === 0x44
      && bytes[3] === 0x46
      && bytes[4] === 0x2d;
    const png = bytes.length >= 8
      && bytes[0] === 0x89
      && bytes[1] === 0x50
      && bytes[2] === 0x4e
      && bytes[3] === 0x47
      && bytes[4] === 0x0d
      && bytes[5] === 0x0a
      && bytes[6] === 0x1a
      && bytes[7] === 0x0a;
    const jpeg = bytes.length >= 3
      && bytes[0] === 0xff
      && bytes[1] === 0xd8
      && bytes[2] === 0xff;
    return pdf || png || jpeg;
  }

  return bytes.length >= 4
    && bytes[0] === 0x1a
    && bytes[1] === 0x45
    && bytes[2] === 0xdf
    && bytes[3] === 0xa3;
}
