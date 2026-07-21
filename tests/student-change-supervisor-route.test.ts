import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  deleteR2Targets: vi.fn(),
  endSession: vi.fn(),
  getToken: vi.fn(),
  isValid: vi.fn(),
  projectDelete: vi.fn(),
  projectFindById: vi.fn(),
  projectSave: vi.fn(),
  reserveSupervisorCapacity: vi.fn(),
  startSession: vi.fn(),
  storageClamp: vi.fn(),
  storageDecrement: vi.fn(),
  studentFindById: vi.fn(),
  studentSave: vi.fn(),
  voiceDeleteMany: vi.fn(),
  voiceFind: vi.fn(),
  withTransactionRetry: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('../lib/supervisorCapacity', () => ({ reserveSupervisorCapacity: mocks.reserveSupervisorCapacity }));
vi.mock('../lib/transactionUtils', () => ({ withTransactionRetry: mocks.withTransactionRetry }));
vi.mock('../lib/r2Deletion', () => ({ deleteR2Targets: mocks.deleteR2Targets }));
vi.mock('../models/User', () => ({ default: { findById: mocks.studentFindById } }));
vi.mock('../models/Project', () => {
  const Project = vi.fn().mockImplementation(function Project(this: Record<string, unknown>, data: Record<string, unknown>) {
    Object.assign(this, data, { _id: 'new-project', save: mocks.projectSave });
  });
  Object.assign(Project, { findById: mocks.projectFindById, findByIdAndDelete: mocks.projectDelete });
  return { default: Project };
});
vi.mock('../models/VoiceNote', () => ({ default: { deleteMany: mocks.voiceDeleteMany, find: mocks.voiceFind } }));
vi.mock('../models/SystemConfig', () => ({
  default: { findOneAndUpdate: mocks.storageDecrement, updateOne: mocks.storageClamp },
}));
vi.mock('../lib/academicReset', () => ({ AcademicResetError: class extends Error {}, resetStudentAcademicInfo: vi.fn() }));
vi.mock('../lib/mailer', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('mongoose', () => ({
  default: {
    Types: { ObjectId: { isValid: mocks.isValid } },
    startSession: mocks.startSession,
  },
}));

import { POST } from '../app/api/dashboard/student/route';

function sessionQuery(value: unknown) {
  return { session: vi.fn().mockResolvedValue(value) };
}

function changeSupervisor(overrides = {}) {
  return POST(new NextRequest('http://localhost/api/dashboard/student', {
    method: 'POST',
    body: JSON.stringify({ action: 'changeSupervisor', id: 'student-1', supervisorId: 'supervisor-2', ...overrides }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/dashboard/student changeSupervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.isValid.mockReturnValue(true);
    mocks.startSession.mockResolvedValue({ endSession: mocks.endSession });
    mocks.withTransactionRetry.mockImplementation((_session, action) => action());
    mocks.studentFindById.mockReturnValue(sessionQuery({
      _id: 'student-1',
      role: 'student',
      supervisorId: 'supervisor-1',
      projectId: 'project-1',
      pdfUrl: '',
      save: mocks.studentSave,
    }));
    mocks.reserveSupervisorCapacity.mockResolvedValue({ kind: 'available', supervisor: { _id: 'supervisor-2' } });
    mocks.projectFindById.mockReturnValue(sessionQuery({
      _id: 'project-1',
      members: ['student-1'],
      status: 'Pending',
      stage: 'PROPOSAL',
      pdfUrl: 'https://bucket.example/project.pdf',
      pdfSize: 42,
    }));
    mocks.voiceFind.mockReturnValue(sessionQuery([
      { _id: 'voice-1', blobUrl: 'https://bucket.example/voice.webm', fileSize: 8 },
    ]));
    mocks.voiceDeleteMany.mockReturnValue({ session: vi.fn().mockResolvedValue(undefined) });
  });

  it('rejects a spoofed student before opening a transaction', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-2', role: 'student' });

    expect((await changeSupervisor()).status).toBe(401);
    expect(mocks.startSession).not.toHaveBeenCalled();
  });

  it('preserves the full-capacity response before cleanup', async () => {
    mocks.reserveSupervisorCapacity.mockResolvedValue({ kind: 'full', maxSlots: 30 });

    const response = await changeSupervisor();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Cannot change supervisor. The selected supervisor is full (30 slots).',
    });
    expect(mocks.deleteR2Targets).not.toHaveBeenCalled();
  });

  it('deletes solo-project files before removing metadata and creates a fresh assignment', async () => {
    const response = await changeSupervisor();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Supervisor changed. Your previous project files were deleted and you started fresh.',
      freedBytes: 50,
    });
    expect(mocks.deleteR2Targets).toHaveBeenCalledWith([
      { key: 'project.pdf', size: 42 },
      { key: 'voice.webm', size: 8 },
    ]);
    expect(mocks.voiceDeleteMany).toHaveBeenCalled();
    expect(mocks.projectDelete).toHaveBeenCalledWith('project-1', { session: expect.any(Object) });
    expect(mocks.storageDecrement).toHaveBeenCalled();
    expect(mocks.studentSave).toHaveBeenCalledWith({ session: expect.any(Object) });
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('returns the existing failure response without deleting metadata when R2 cleanup fails', async () => {
    mocks.deleteR2Targets.mockRejectedValue(new Error('R2 unavailable'));

    const response = await changeSupervisor();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Failed to change supervisor.' });
    expect(mocks.projectDelete).not.toHaveBeenCalled();
    expect(mocks.storageDecrement).not.toHaveBeenCalled();
    expect(mocks.studentSave).not.toHaveBeenCalled();
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });
});
