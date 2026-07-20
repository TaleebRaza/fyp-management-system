import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  endSession: vi.fn(),
  getToken: vi.fn(),
  isValid: vi.fn(),
  projectUpdate: vi.fn(),
  reserveSupervisorCapacity: vi.fn(),
  startSession: vi.fn(),
  studentFindById: vi.fn(),
  userUpdateMany: vi.fn(),
  withTransactionRetry: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('../lib/supervisorCapacity', () => ({ reserveSupervisorCapacity: mocks.reserveSupervisorCapacity }));
vi.mock('../lib/transactionUtils', () => ({ withTransactionRetry: mocks.withTransactionRetry }));
vi.mock('../models/User', () => ({ default: { findById: mocks.studentFindById, updateMany: mocks.userUpdateMany } }));
vi.mock('../models/Project', () => ({ default: { findByIdAndUpdate: mocks.projectUpdate } }));
vi.mock('../models/VoiceNote', () => ({ default: {} }));
vi.mock('../models/SystemConfig', () => ({ default: {} }));
vi.mock('../lib/academicReset', () => ({ AcademicResetError: class extends Error {}, resetStudentAcademicInfo: vi.fn() }));
vi.mock('../lib/mailer', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: {} }));
vi.mock('@aws-sdk/client-s3', () => ({ DeleteObjectCommand: vi.fn() }));
vi.mock('mongoose', () => ({
  default: {
    Types: {
      ObjectId: Object.assign(function ObjectId(value: unknown) { return value; }, { isValid: mocks.isValid }),
    },
    startSession: mocks.startSession,
  },
}));

import { POST } from '../app/api/dashboard/student/route';

function sessionQuery(value: unknown) {
  return { session: vi.fn().mockResolvedValue(value) };
}

function assign(overrides = {}) {
  return POST(new NextRequest('http://localhost/api/dashboard/student', {
    method: 'POST',
    body: JSON.stringify({ action: 'assignSupervisor', id: 'student-1', supervisorId: 'supervisor-1', ...overrides }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/dashboard/student assignSupervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.isValid.mockReturnValue(true);
    mocks.startSession.mockResolvedValue({ endSession: mocks.endSession });
    mocks.withTransactionRetry.mockImplementation((_session, action) => action());
    mocks.studentFindById.mockReturnValue(sessionQuery({ projectId: 'project-1', supervisorId: null, status: 'Unassigned' }));
    mocks.reserveSupervisorCapacity.mockResolvedValue({ kind: 'available', supervisor: { _id: 'supervisor-1' } });
  });

  it('rejects a spoofed student before opening a transaction', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-2', role: 'student' });

    expect((await assign()).status).toBe(401);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('preserves the transaction-backed team assignment response', async () => {
    const response = await assign();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'Supervisor successfully assigned to your team!' });
    expect(mocks.reserveSupervisorCapacity).toHaveBeenCalledWith('supervisor-1', expect.any(Object));
    expect(mocks.projectUpdate).toHaveBeenCalledWith(
      'project-1',
      { $set: { supervisorId: expect.anything() } },
      { session: expect.any(Object) }
    );
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });
});
