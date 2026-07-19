import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getSignedUrl: vi.fn(),
  getToken: vi.fn(),
  projectFindById: vi.fn(),
  systemConfigFindOne: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/Project', () => ({
  default: { findById: mocks.projectFindById },
}));
vi.mock('../models/SystemConfig', () => ({
  default: { findOne: mocks.systemConfigFindOne },
}));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('@aws-sdk/client-s3', () => ({ PutObjectCommand: vi.fn() }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }));
vi.mock('../lib/s3-client', () => ({
  BUCKET_NAME: 'test-bucket',
  MAX_STORAGE_BYTES: 10_000,
  s3Client: {},
}));

import { POST } from '../app/api/voice/upload/route';

function leanQuery(value: unknown) {
  const query = {
    lean: vi.fn().mockResolvedValue(value),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  return query;
}

function uploadVoice(body: Record<string, unknown> = {}) {
  return POST(new NextRequest('http://localhost/api/voice/upload', {
    method: 'POST',
    body: JSON.stringify({
      contentType: 'audio/webm',
      fileSize: 1200,
      projectId: 'project-1',
      ...body,
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/voice/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.getSignedUrl.mockResolvedValue('https://upload.example/signed');
    mocks.systemConfigFindOne.mockResolvedValue({ usedBytes: 100 });
    mocks.projectFindById.mockReturnValue(
      leanQuery({ members: ['student-1'], supervisorId: 'supervisor-1' })
    );
  });

  it('rejects anonymous upload requests', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await uploadVoice();

    expect(response.status).toBe(401);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects roles that cannot create voice content', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const response = await uploadVoice();

    expect(response.status).toBe(403);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects a student upload without project context', async () => {
    const response = await uploadVoice({ projectId: undefined });

    expect(response.status).toBe(400);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects an invalid file size', async () => {
    const response = await uploadVoice({ fileSize: 0 });

    expect(response.status).toBe(400);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects a student upload for another project', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-2', role: 'student' });

    const response = await uploadVoice();

    expect(response.status).toBe(403);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('creates an upload URL for a project member', async () => {
    const response = await uploadVoice();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      uploadUrl: 'https://upload.example/signed',
    });
  });

  it('creates a project upload URL for its assigned supervisor', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    const response = await uploadVoice();

    expect(response.status).toBe(200);
  });

  it('preserves supervisor broadcast uploads without a project ID', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    const response = await uploadVoice({ projectId: undefined });

    expect(response.status).toBe(200);
  });
});
