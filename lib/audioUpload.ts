type AudioUploadResult = {
  uploadUrl: string;
  key: string;
};

function readUploadResult(value: unknown): AudioUploadResult | null {
  if (!value || typeof value !== 'object') return null;

  const result = value as Record<string, unknown>;
  const uploadUrl = String(result.uploadUrl || '');
  const key = String(result.key || '');

  return uploadUrl && key ? { uploadUrl, key } : null;
}

export async function uploadAudioBlob(blob: Blob, projectId?: string) {
  const uploadUrlResponse = await fetch('/api/voice/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contentType: blob.type || 'audio/webm',
      fileSize: blob.size,
      ...(projectId ? { projectId } : {}),
    }),
  });
  const uploadData = readUploadResult(await uploadUrlResponse.json());

  if (!uploadUrlResponse.ok || !uploadData) {
    throw new Error('Failed to fetch upload URL');
  }

  const storageResponse = await fetch(uploadData.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob,
  });

  if (!storageResponse.ok) throw new Error('Cloudflare R2 upload rejected the file');

  return { key: uploadData.key, size: blob.size };
}
