import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  findOne: vi.fn(),
  getSignedUrl: vi.fn(),
  getToken: vi.fn(),
  putObjectCommand: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/SystemConfig', () => ({ default: { findOne: mocks.findOne } }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('@aws-sdk/client-s3', () => ({ PutObjectCommand: mocks.putObjectCommand }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }));
vi.mock('../lib/s3-client', () => ({
  BUCKET_NAME: 'bucket',
  MAX_STORAGE_BYTES: 10_000_000,
  s3Client: {},
}));

import { POST } from '../app/api/upload/route';

function upload() {
  return POST(new NextRequest('http://localhost/api/upload', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'proposal.pdf',
      contentType: 'application/pdf',
      fileSize: 100,
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.findOne.mockResolvedValue(null);
    mocks.putObjectCommand.mockImplementation(function () { return {}; });
    mocks.getSignedUrl.mockResolvedValue('https://upload.example.test/signed');
  });

  it('rejects anonymous uploads before database access', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await upload()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects supervisor uploads before database access', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    expect((await upload()).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('preserves the valid student signing response', async () => {
    const response = await upload();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      uploadUrl: 'https://upload.example.test/signed',
      url: expect.stringMatching(/^proposals\//),
    }));
  });
});
