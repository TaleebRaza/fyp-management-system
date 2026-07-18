import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getSignedUrl: vi.fn(),
  getToken: vi.fn(),
  projectFindById: vi.fn(),
  projectFindOne: vi.fn(),
  userExists: vi.fn(),
  userFindOne: vi.fn(),
  voiceNoteFindOne: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/Project', () => ({
  default: {
    findById: mocks.projectFindById,
    findOne: mocks.projectFindOne,
  },
}));
vi.mock('../models/User', () => ({
  default: {
    exists: mocks.userExists,
    findOne: mocks.userFindOne,
  },
}));
vi.mock('../models/VoiceNote', () => ({
  default: { findOne: mocks.voiceNoteFindOne },
}));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: vi.fn(),
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mocks.getSignedUrl,
}));
vi.mock('../lib/s3-client', () => ({
  BUCKET_NAME: 'test-bucket',
  s3Client: {},
}));

import { GET } from '../app/api/read-pdf/route';

function leanQuery(value: unknown) {
  const query = {
    lean: vi.fn().mockResolvedValue(value),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  return query;
}

function getFile(key?: string) {
  const path = key ? `/api/read-pdf?url=${encodeURIComponent(key)}` : '/api/read-pdf';
  return GET(new NextRequest(`http://localhost${path}`));
}

describe('GET /api/read-pdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.getSignedUrl.mockResolvedValue('https://signed.example/file');
    mocks.projectFindOne.mockReturnValue(leanQuery(null));
    mocks.projectFindById.mockReturnValue(leanQuery(null));
    mocks.userFindOne.mockReturnValue(leanQuery(null));
    mocks.userExists.mockResolvedValue(null);
    mocks.voiceNoteFindOne.mockReturnValue(leanQuery(null));
  });

  it('rejects anonymous requests before accessing storage', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await getFile('proposals/owned.pdf');

    expect(response.status).toBe(401);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects a request without a document key', async () => {
    const response = await getFile();

    expect(response.status).toBe(400);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('streams a project PDF to a project member', async () => {
    mocks.projectFindOne.mockReturnValue(
      leanQuery({
        members: ['student-1', 'student-2'],
        pdfUrl: 'https://bucket.example/proposals/owned.pdf',
        supervisorId: 'supervisor-1',
      })
    );

    const response = await getFile('proposals/owned.pdf');

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://signed.example/file');
  });

  it('rejects a student requesting another project PDF', async () => {
    mocks.projectFindOne.mockReturnValue(
      leanQuery({
        members: ['student-2'],
        pdfUrl: 'proposals/other.pdf',
        supervisorId: 'supervisor-1',
      })
    );

    const response = await getFile('proposals/other.pdf');

    expect(response.status).toBe(403);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('streams a project PDF to its supervisor', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });
    mocks.projectFindOne.mockReturnValue(
      leanQuery({ members: ['student-1'], pdfUrl: 'proposals/owned.pdf', supervisorId: 'supervisor-1' })
    );

    const response = await getFile('proposals/owned.pdf');

    expect(response.status).toBe(307);
  });

  it('streams any recorded resource to an admin', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.projectFindOne.mockReturnValue(
      leanQuery({ members: ['student-1'], pdfUrl: 'proposals/owned.pdf', supervisorId: 'supervisor-1' })
    );

    const response = await getFile('proposals/owned.pdf');

    expect(response.status).toBe(307);
  });

  it('streams a voice note to members of its project', async () => {
    mocks.voiceNoteFindOne.mockReturnValue(leanQuery({ projectId: 'project-1' }));
    mocks.projectFindById.mockReturnValue(
      leanQuery({ members: ['student-1'], supervisorId: 'supervisor-1' })
    );

    const response = await getFile('voicenotes/note.webm');

    expect(response.status).toBe(307);
  });

  it('rejects a voice note from another project', async () => {
    mocks.voiceNoteFindOne.mockReturnValue(leanQuery({ projectId: 'project-2' }));
    mocks.projectFindById.mockReturnValue(
      leanQuery({ members: ['student-2'], supervisorId: 'supervisor-1' })
    );

    const response = await getFile('voicenotes/other-note.webm');

    expect(response.status).toBe(403);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('streams a legacy PDF to its recorded student owner', async () => {
    mocks.userFindOne.mockReturnValue(
      leanQuery({ _id: 'student-1', projectId: null, supervisorId: 'supervisor-1' })
    );

    const response = await getFile('proposals/legacy.pdf');

    expect(response.status).toBe(307);
  });

  it('streams broadcast audio only to the assigned supervisor and their students', async () => {
    mocks.userFindOne.mockReturnValue(leanQuery({ _id: 'supervisor-1' }));
    mocks.userExists.mockResolvedValue({ _id: 'student-1' });

    const response = await getFile('voicenotes/broadcast.webm');

    expect(response.status).toBe(307);
  });

  it('rejects broadcast audio for students assigned to another supervisor', async () => {
    mocks.userFindOne.mockReturnValue(leanQuery({ _id: 'supervisor-1' }));

    const response = await getFile('voicenotes/broadcast.webm');

    expect(response.status).toBe(403);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });
});
