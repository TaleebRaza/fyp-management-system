import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abortTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  connectToDatabase: vi.fn(),
  endSession: vi.fn(),
  getToken: vi.fn(),
  ledgerUpdate: vi.fn(),
  projectFindById: vi.fn(),
  startSession: vi.fn(),
  startTransaction: vi.fn(),
  voiceDeleteMany: vi.fn(),
  voiceFind: vi.fn(),
  voiceFindById: vi.fn(),
  voiceFindByIdAndUpdate: vi.fn(),
  voiceNoteConstructor: vi.fn(),
  voiceSave: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/Project', () => ({
  default: { findById: mocks.projectFindById },
}));
vi.mock('../models/VoiceNote', () => ({
  default: Object.assign(mocks.voiceNoteConstructor, {
    deleteMany: mocks.voiceDeleteMany,
    find: mocks.voiceFind,
    findById: mocks.voiceFindById,
    findByIdAndUpdate: mocks.voiceFindByIdAndUpdate,
  }),
}));
vi.mock('../models/SystemConfig', () => ({
  default: { findOneAndUpdate: mocks.ledgerUpdate },
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

import { GET, PATCH, POST } from '../app/api/voice/route';

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

function postVoice(overrides: Record<string, unknown> = {}) {
  return POST(new NextRequest('http://localhost/api/voice', {
    method: 'POST',
    body: JSON.stringify({
      projectId: 'project-1',
      senderId: 'student-1',
      blobUrl: 'voicenotes/note.webm',
      fileSize: 1200,
      ...overrides,
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

function patchVoice(noteId: string | null = 'note-1') {
  return PATCH(new NextRequest('http://localhost/api/voice', {
    method: 'PATCH',
    body: JSON.stringify({ noteId }),
    headers: { 'Content-Type': 'application/json' },
  }));
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

describe('POST /api/voice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.projectFindById.mockReturnValue(
      leanQuery({ members: ['student-1', 'student-2'], supervisorId: 'supervisor-1' })
    );
    mocks.voiceNoteConstructor.mockImplementation(function (note) {
      return { ...(note as object), save: mocks.voiceSave };
    });
  });

  it('rejects anonymous writes', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await postVoice();

    expect(response.status).toBe(401);
    expect(mocks.voiceSave).not.toHaveBeenCalled();
  });

  it('rejects roles that do not participate in project voice chat', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const response = await postVoice({ senderId: 'admin-1' });

    expect(response.status).toBe(403);
    expect(mocks.voiceSave).not.toHaveBeenCalled();
  });

  it('rejects sender identity spoofing', async () => {
    const response = await postVoice({ senderId: 'student-2' });

    expect(response.status).toBe(403);
    expect(mocks.voiceSave).not.toHaveBeenCalled();
  });

  it('rejects writes to another project', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-3', role: 'student' });

    const response = await postVoice({ senderId: 'student-3' });

    expect(response.status).toBe(403);
    expect(mocks.voiceSave).not.toHaveBeenCalled();
    expect(mocks.ledgerUpdate).not.toHaveBeenCalled();
  });

  it('saves a note for a project member using the authenticated identity', async () => {
    const response = await postVoice();

    expect(response.status).toBe(201);
    expect(mocks.voiceNoteConstructor).toHaveBeenCalledWith({
      projectId: 'project-1',
      senderId: 'student-1',
      blobUrl: 'voicenotes/note.webm',
      fileSize: 1200,
    });
    expect(mocks.ledgerUpdate).toHaveBeenCalledOnce();
  });

  it('saves a note for the assigned supervisor', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    const response = await postVoice({ senderId: 'supervisor-1' });

    expect(response.status).toBe(201);
  });
});

describe('PATCH /api/voice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.voiceFindById.mockReturnValue(leanQuery({ projectId: 'project-1' }));
    mocks.projectFindById.mockReturnValue(
      leanQuery({ members: ['student-1', 'student-2'], supervisorId: 'supervisor-1' })
    );
    mocks.voiceFindByIdAndUpdate.mockResolvedValue({ _id: 'note-1', isPlayed: true });
  });

  it('rejects anonymous updates', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await patchVoice();

    expect(response.status).toBe(401);
    expect(mocks.voiceFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a missing note ID', async () => {
    const response = await patchVoice(null);

    expect(response.status).toBe(400);
    expect(mocks.voiceFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects roles that do not participate in project voice chat', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const response = await patchVoice();

    expect(response.status).toBe(403);
    expect(mocks.voiceFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects updates to another project note', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-3', role: 'student' });

    const response = await patchVoice();

    expect(response.status).toBe(403);
    expect(mocks.voiceFindByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('marks a project note as played for a project member', async () => {
    const response = await patchVoice();

    expect(response.status).toBe(200);
    expect(mocks.voiceFindByIdAndUpdate).toHaveBeenCalledWith(
      'note-1',
      { isPlayed: true, playedAt: expect.any(Date) },
      { new: true }
    );
  });

  it('marks a project note as played for the assigned supervisor', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    const response = await patchVoice();

    expect(response.status).toBe(200);
  });

  it('returns not found without updating when the note does not exist', async () => {
    mocks.voiceFindById.mockReturnValue(leanQuery(null));

    const response = await patchVoice('missing-note');

    expect(response.status).toBe(404);
    expect(mocks.voiceFindByIdAndUpdate).not.toHaveBeenCalled();
  });
});
