import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  ledgerClamp: vi.fn(),
  ledgerUpdate: vi.fn(),
  s3Send: vi.fn(),
  userBulkWrite: vi.fn(),
  userFind: vi.fn(),
  voiceDeleteMany: vi.fn(),
  voiceFind: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/VoiceNote', () => ({ default: { deleteMany: mocks.voiceDeleteMany, find: mocks.voiceFind } }));
vi.mock('../models/User', () => ({ default: { bulkWrite: mocks.userBulkWrite, find: mocks.userFind } }));
vi.mock('../models/SystemConfig', () => ({
  default: { findOneAndUpdate: mocks.ledgerUpdate, updateOne: mocks.ledgerClamp },
}));
vi.mock('@aws-sdk/client-s3', () => ({ DeleteObjectCommand: vi.fn(function (input) { return input; }) }));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: { send: mocks.s3Send } }));

import { GET } from '../app/api/cron/voice-cleanup/route';

describe('GET /api/cron/voice-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.voiceFind.mockResolvedValue([]);
    mocks.userFind.mockResolvedValue([]);
  });

  it('rejects requests without the cron secret before accessing storage', async () => {
    const response = await GET(new NextRequest('http://localhost/api/cron/voice-cleanup'));

    expect(response.status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('moves played-note cleanup to the secured cron path', async () => {
    const response = await GET(new NextRequest('http://localhost/api/cron/voice-cleanup', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));

    expect(response.status).toBe(200);
    expect(mocks.voiceFind).toHaveBeenCalledWith({
      $or: [
        { isPlayed: true, playedAt: { $lte: expect.any(Date) } },
        { createdAt: { $lte: expect.any(Date) } },
      ],
    });
  });

  it('keeps voice records and the ledger unchanged when R2 cleanup fails', async () => {
    mocks.voiceFind.mockResolvedValue([
      { _id: 'note-1', blobUrl: 'voicenotes/note.webm', fileSize: 30 },
    ]);
    mocks.s3Send.mockRejectedValue(new Error('R2 unavailable'));

    const response = await GET(new NextRequest('http://localhost/api/cron/voice-cleanup', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));

    expect(response.status).toBe(500);
    expect(mocks.s3Send).toHaveBeenCalledTimes(2);
    expect(mocks.voiceDeleteMany).not.toHaveBeenCalled();
    expect(mocks.ledgerUpdate).not.toHaveBeenCalled();
  });
});
