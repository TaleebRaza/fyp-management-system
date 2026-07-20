import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  findById: vi.fn(),
  findByIdAndUpdate: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: {
    findById: mocks.findById,
    findByIdAndUpdate: mocks.findByIdAndUpdate,
  },
}));
vi.mock('../models/Project', () => ({ default: {} }));
vi.mock('../models/VoiceNote', () => ({ default: {} }));
vi.mock('../models/SystemConfig', () => ({ default: {} }));
vi.mock('../lib/academicReset', () => ({ AcademicResetError: class extends Error {}, resetStudentAcademicInfo: vi.fn() }));
vi.mock('../lib/mailer', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: {} }));
vi.mock('@aws-sdk/client-s3', () => ({ DeleteObjectCommand: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('mongoose', () => ({ default: {} }));

import { POST } from '../app/api/dashboard/student/route';

function submit(studentId = 'student-2') {
  return POST(new NextRequest('http://localhost/api/dashboard/student', {
    method: 'POST',
    body: JSON.stringify({
      id: studentId,
      title: 'Secure Project',
      desc: 'A test project',
      domains: ['artificial-intelligence'],
      tools: 'TypeScript',
      pdfUrl: '',
      fileSize: 0,
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/dashboard/student project submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-2', role: 'student' });
    mocks.findById.mockResolvedValue({ projectId: null, pdfUrl: '' });
    mocks.findByIdAndUpdate.mockResolvedValue({
      name: 'Student Two',
      supervisorId: null,
    });
  });

  it('rejects anonymous submission before a student record is read', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await submit()).status).toBe(401);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('rejects non-student submission before a student record is read', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    expect((await submit()).status).toBe(401);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('rejects a student submitting on another student’s behalf', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    expect((await submit()).status).toBe(401);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('preserves the matching-student submission', async () => {
    const response = await submit();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'Project Submitted!' });
    expect(mocks.findByIdAndUpdate).toHaveBeenCalledWith(
      'student-2',
      expect.objectContaining({ $set: expect.objectContaining({ status: 'Submitted For Review' }) }),
      { returnDocument: 'after' }
    );
  });
});
