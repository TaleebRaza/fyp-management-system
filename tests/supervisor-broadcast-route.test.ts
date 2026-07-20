import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getToken: vi.fn(),
  ledgerClamp: vi.fn(),
  ledgerUpdate: vi.fn(),
  s3Send: vi.fn(),
  supervisorFindById: vi.fn(),
  supervisorSave: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectCommand: vi.fn(function (input) { return input; }),
}));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: { send: mocks.s3Send } }));
vi.mock('../models/SystemConfig', () => ({
  default: { findOneAndUpdate: mocks.ledgerUpdate, updateOne: mocks.ledgerClamp },
}));
vi.mock('../models/User', () => ({ default: { findById: mocks.supervisorFindById } }));

import { DELETE } from '../app/api/dashboard/supervisor/broadcast/route';

function clearBroadcast() {
  return DELETE(new NextRequest('http://localhost/api/dashboard/supervisor/broadcast', { method: 'DELETE' }));
}

describe('DELETE /api/dashboard/supervisor/broadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });
    mocks.supervisorFindById.mockResolvedValue({
      broadcastType: 'audio',
      broadcastContent: 'https://bucket.example/broadcasts/old.webm',
      broadcastSize: 120,
      save: mocks.supervisorSave,
    });
  });

  it('keeps broadcast metadata and the ledger when R2 deletion fails after retries', async () => {
    mocks.s3Send.mockRejectedValue(new Error('R2 unavailable'));

    expect((await clearBroadcast()).status).toBe(500);
    expect(mocks.s3Send).toHaveBeenCalledTimes(2);
    expect(mocks.supervisorSave).not.toHaveBeenCalled();
    expect(mocks.ledgerUpdate).not.toHaveBeenCalled();
  });

  it('deletes R2 before clearing metadata and refunding its ledger bytes', async () => {
    mocks.s3Send.mockResolvedValue({});

    expect((await clearBroadcast()).status).toBe(200);
    expect(mocks.supervisorSave).toHaveBeenCalledOnce();
    expect(mocks.ledgerUpdate).toHaveBeenCalledWith(
      { configKey: 'storage' },
      { $inc: { usedBytes: -120 } },
      { upsert: true }
    );
  });
});
