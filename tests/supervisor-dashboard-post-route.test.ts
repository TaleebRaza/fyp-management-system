import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getToken: vi.fn(),
  isValid: vi.fn(),
  userFindById: vi.fn(),
  userFind: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  projectFindById: vi.fn(),
  projectFindByIdAndUpdate: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: {
    findById: mocks.userFindById,
    find: mocks.userFind,
    findByIdAndUpdate: mocks.userFindByIdAndUpdate,
    updateMany: mocks.userUpdateMany,
  },
}));
vi.mock('../models/Project', () => ({
  default: {
    findById: mocks.projectFindById,
    findByIdAndUpdate: mocks.projectFindByIdAndUpdate,
  },
}));
vi.mock('../models/SystemConfig', () => ({ default: {} }));
vi.mock('../lib/mailer', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: {} }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('mongoose', () => ({ default: { Types: { ObjectId: { isValid: mocks.isValid } } }, ClientSession: {} }));

import { POST } from '../app/api/dashboard/supervisor/route';

function postAction(body: Record<string, string>) {
  return POST(new NextRequest('http://localhost/api/dashboard/supervisor', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }));
}

function ownStudent() {
  return { _id: 'student-1', role: 'student', supervisorId: 'supervisor-1' };
}

describe('POST /api/dashboard/supervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });
    mocks.isValid.mockReturnValue(true);
    mocks.userFindById.mockResolvedValue(ownStudent());
    mocks.userFind.mockResolvedValue([]);
    mocks.userUpdateMany.mockResolvedValue({});
    mocks.projectFindByIdAndUpdate.mockResolvedValue({});
  });

  it.each(['updateStatus', 'migrate', 'removeStudent'])(
    'rejects anonymous %s actions before reading the student',
    async (action) => {
      mocks.getToken.mockResolvedValue(null);

      const response = await postAction({ action, studentId: 'student-1', status: 'Changes Requested' });

      expect(response.status).toBe(401);
      expect(mocks.userFindById).not.toHaveBeenCalled();
    }
  );

  it('rejects a student attempting a supervisor action', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-2', role: 'student' });

    const response = await postAction({ action: 'updateStatus', studentId: 'student-1', status: 'Changes Requested' });

    expect(response.status).toBe(403);
    expect(mocks.userFindById).not.toHaveBeenCalled();
  });

  it.each(['updateStatus', 'migrate', 'removeStudent'])(
    'rejects a supervisor acting on another supervisor student for %s',
    async (action) => {
      mocks.userFindById.mockResolvedValue({ ...ownStudent(), supervisorId: 'supervisor-2' });

      const response = await postAction({ action, studentId: 'student-1', status: 'Changes Requested' });

      expect(response.status).toBe(403);
    }
  );

  it('keeps an own-student status update working', async () => {
    const response = await postAction({
      action: 'updateStatus',
      studentId: 'student-1',
      status: 'Changes Requested',
      remarks: 'Add the missing test cases.',
    });

    expect(response.status).toBe(200);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ['student-1'] } },
      { $set: { status: 'Changes Requested', remarks: 'Add the missing test cases.' } }
    );
  });

  it('allows an admin to update a student outside their supervision', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.userFindById.mockResolvedValue({ ...ownStudent(), supervisorId: 'supervisor-2' });

    const response = await postAction({
      action: 'updateStatus',
      studentId: 'student-1',
      status: 'Changes Requested',
    });

    expect(response.status).toBe(200);
  });

  it('keeps a solo-student removal working', async () => {
    mocks.userFindById.mockResolvedValue({ ...ownStudent(), projectId: null });

    const response = await postAction({ action: 'removeStudent', studentId: 'student-1' });

    expect(response.status).toBe(200);
    expect(mocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      'student-1',
      expect.objectContaining({ $set: expect.objectContaining({ status: 'Unassigned' }) })
    );
  });

  it('keeps migration-code validation before opening a transaction', async () => {
    const response = await postAction({ action: 'migrate', studentId: 'student-1' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Migration code is required.' });
  });
});
