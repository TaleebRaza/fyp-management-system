import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class AcademicResetError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  }

  return {
    AcademicResetError,
    connectToDatabase: vi.fn(),
    getToken: vi.fn(),
    resetStudentAcademicInfo: vi.fn(),
  };
});

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../lib/academicReset', () => ({
  AcademicResetError: mocks.AcademicResetError,
  resetStudentAcademicInfo: mocks.resetStudentAcademicInfo,
}));
vi.mock('../models/User', () => ({ default: {} }));
vi.mock('../models/Project', () => ({ default: {} }));
vi.mock('../models/VoiceNote', () => ({ default: {} }));
vi.mock('../models/SystemConfig', () => ({ default: {} }));
vi.mock('../lib/mailer', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: {} }));
vi.mock('@aws-sdk/client-s3', () => ({ DeleteObjectCommand: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('mongoose', () => ({ default: {} }));

import { POST } from '../app/api/dashboard/student/route';

function updateAcademicInfo(body: Record<string, string> = {}) {
  return POST(new NextRequest('http://localhost/api/dashboard/student', {
    method: 'POST',
    body: JSON.stringify({
      action: 'updateProgramBatch',
      id: 'student-1',
      program: 'BSAI',
      batch: 'Fall 2026',
      ...body,
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/dashboard/student updateProgramBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
    mocks.resetStudentAcademicInfo.mockResolvedValue({
      message: 'Program and Batch updated successfully. Your dashboard has been reset.',
      freedBytes: 120,
    });
  });

  it('keeps the actor-bound request and success response while using the shared reset', async () => {
    const response = await updateAcademicInfo();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: 'Program and Batch updated successfully. Your dashboard has been reset.',
      freedBytes: 120,
    });
    expect(mocks.resetStudentAcademicInfo).toHaveBeenCalledWith({
      targetUserId: 'student-1',
      newProgram: 'BSAI',
      newBatch: 'Fall 2026',
      actor: 'student',
      enforceStudentCooldown: true,
    });
  });

  it('keeps the existing actor check before invoking the shared reset', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-2', role: 'student' });

    expect((await updateAcademicInfo()).status).toBe(401);
    expect(mocks.resetStudentAcademicInfo).not.toHaveBeenCalled();
  });

  it('returns shared validation errors with their established status', async () => {
    mocks.resetStudentAcademicInfo.mockRejectedValue(
      new mocks.AcademicResetError('Invalid program selected.', 400)
    );

    const response = await updateAcademicInfo();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid program selected.' });
  });
});
