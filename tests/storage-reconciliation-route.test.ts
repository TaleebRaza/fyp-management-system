import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getToken: vi.fn(),
  projectFind: vi.fn(),
  s3Send: vi.fn(),
  systemConfigFindOne: vi.fn(),
  userFind: vi.fn(),
  voiceFind: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: { send: mocks.s3Send } }));
vi.mock('@aws-sdk/client-s3', () => ({
  ListObjectsV2Command: vi.fn(function (input) { return input; }),
}));
vi.mock('../models/SystemConfig', () => ({ default: { findOne: mocks.systemConfigFindOne } }));
vi.mock('../models/Project', () => ({ default: { find: mocks.projectFind } }));
vi.mock('../models/VoiceNote', () => ({ default: { find: mocks.voiceFind } }));
vi.mock('../models/User', () => ({ default: { find: mocks.userFind } }));

import { GET } from '../app/api/admin/storage-reconciliation/route';

function lean(value: unknown) {
  return { lean: () => Promise.resolve(value) };
}

function selectLean(value: unknown) {
  return { select: () => lean(value) };
}

function reconcile() {
  return GET(new NextRequest('http://localhost/api/admin/storage-reconciliation'));
}

describe('GET /api/admin/storage-reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.systemConfigFindOne.mockReturnValue(lean({ usedBytes: 100 }));
    mocks.projectFind.mockReturnValue(selectLean([{ pdfUrl: 'proposal.pdf', pdfSize: 100 }]));
    mocks.voiceFind.mockReturnValue(selectLean([]));
    mocks.userFind.mockReturnValue(selectLean([]));
    mocks.s3Send.mockResolvedValue({ Contents: [{ Key: 'proposal.pdf', Size: 100 }] });
  });

  it('rejects anonymous callers before database and R2 reads', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await reconcile()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.s3Send).not.toHaveBeenCalled();
  });

  it('rejects non-admin callers before database and R2 reads', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    expect((await reconcile()).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.s3Send).not.toHaveBeenCalled();
  });

  it('returns an admin-only read-only report across paginated R2 listings', async () => {
    mocks.s3Send
      .mockResolvedValueOnce({
        Contents: [{ Key: 'proposal.pdf', Size: 100 }],
        IsTruncated: true,
        NextContinuationToken: 'next-page',
      })
      .mockResolvedValueOnce({ Contents: [{ Key: 'orphan.webm', Size: 20 }] });

    const response = await reconcile();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ledgerBytes: 100,
      referencedBytes: 100,
      objectBytes: 120,
      unreferencedObjectKeys: ['orphan.webm'],
    });
    expect(mocks.s3Send).toHaveBeenCalledTimes(2);
    expect(mocks.s3Send.mock.calls[1][0]).toMatchObject({ ContinuationToken: 'next-page' });
  });
});
