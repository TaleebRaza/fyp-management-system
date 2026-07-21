import { afterEach, describe, expect, it, vi } from 'vitest';

import { uploadAudioBlob } from '../lib/audioUpload';

describe('uploadAudioBlob', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the existing presign and direct-upload handshake', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://r2.example/upload', key: 'voice/note.webm' }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    const blob = new Blob(['audio'], { type: 'audio/webm' });

    await expect(uploadAudioBlob(blob, 'project-1')).resolves.toEqual({ key: 'voice/note.webm', size: 5 });
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/voice/upload', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://r2.example/upload', expect.objectContaining({ method: 'PUT', body: blob }));
  });

  it('rejects an incomplete presign response before attempting storage upload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: 'voice/note.webm' }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadAudioBlob(new Blob(['audio']))).rejects.toThrow('Failed to fetch upload URL');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
