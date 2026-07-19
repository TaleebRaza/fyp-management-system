import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abortTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  connectToDatabase: vi.fn(),
  endSession: vi.fn(),
  getToken: vi.fn(),
  projectFindById: vi.fn(),
  startSession: vi.fn(),
  startTransaction: vi.fn(),
  voiceDeleteMany: vi.fn(),
  voiceFind: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/Project', () => ({
  default: { findById: mocks.projectFindById },
}));
vi.mock('../models/VoiceNote', () => ({
  default: {
    deleteMany: mocks.voiceDeleteMany,
    find: mocks.voiceFind,
  },
}));
vi.mock('../models/SystemConfig', () => ({
  default: { findOneAndUpdate: vi.fn() },
}));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('mongoose', () => ({
  default: { startSession: mocks.startSession },
}));
vi.mock('@aws-sdk/client-s3', () => ({ DeleteObjectCommand: vi.fn() }));
vi.mock('../lib/s3-client', () => ({
  BUCKET_NAME: 'test-bucket',
  s3Client: { send: vi.fn() },
}));

import { GET } from '../app/api/voice/route';

function leanQuery(value: unknown) {
  const query = {
    lean: vi.fn().mockResolvedValue(value),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  return query;
}

function activeNotesQuery(value: unknown[]) {
  return {
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(value),
  };
}

function getVoice(projectId = 'project-1') {
  return GET(new NextRequest(`http://localhost/api/voice?projectId=${projectId}`));
}

describe('GET /api/voice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.projectFindById.mockReturnValue(
      leanQuery({ members: ['student-1', 'student-2'], supervisorId: 'supervisor-1' })
    );
    mocks.startSession.mockResolvedValue({
      abortTransaction: mocks.abortTransaction,
      commitTransaction: mocks.commitTransaction,
      endSession: mocks.endSession,
      startTransaction: mocks.startTransaction,
    });
    mocks.voiceFind
      .mockReturnValueOnce({ session: vi.fn().mockResolvedValue([]) })
      .mockReturnValueOnce(activeNotesQuery([{ _id: 'note-1' }]));
  });

  it('rejects anonymous requests before starting cleanup', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await getVoice();

    expect(response.status).toBe(401);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('rejects roles that do not participate in project voice chat', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const response = await getVoice();

    expect(response.status).toBe(403);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('returns notes to a project member', async () => {
    const response = await getVoice();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ notes: [{ _id: 'note-1' }] });
    expect(mocks.commitTransaction).toHaveBeenCalledOnce();
  });

  it('returns notes to the project supervisor', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    const response = await getVoice();

    expect(response.status).toBe(200);
  });

  it('rejects a student from another project before starting cleanup', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-3', role: 'student' });

    const response = await getVoice();

    expect(response.status).toBe(403);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('rejects a supervisor from another project before starting cleanup', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-2', role: 'supervisor' });

    const response = await getVoice();

    expect(response.status).toBe(403);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });
});
