import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abortTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  connectToDatabase: vi.fn(),
  endSession: vi.fn(),
  isValidObjectId: vi.fn(),
  projectFindById: vi.fn(),
  projectFindByIdAndDelete: vi.fn(),
  projectFindByIdAndUpdate: vi.fn(),
  projectSave: vi.fn(),
  s3Send: vi.fn(),
  startSession: vi.fn(),
  startTransaction: vi.fn(),
  storageClamp: vi.fn(),
  storageDecrement: vi.fn(),
  userFindById: vi.fn(),
  userSave: vi.fn(),
  voiceDeleteMany: vi.fn(),
  voiceFind: vi.fn(),
}));

const projectConstructor = vi.hoisted(() => vi.fn());

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({ default: { findById: mocks.userFindById } }));
vi.mock('../models/Project', () => ({
  default: Object.assign(projectConstructor, {
    findById: mocks.projectFindById,
    findByIdAndDelete: mocks.projectFindByIdAndDelete,
    findByIdAndUpdate: mocks.projectFindByIdAndUpdate,
  }),
}));
vi.mock('../models/VoiceNote', () => ({
  default: { deleteMany: mocks.voiceDeleteMany, find: mocks.voiceFind },
}));
vi.mock('../models/SystemConfig', () => ({
  default: {
    findOneAndUpdate: mocks.storageDecrement,
    updateOne: mocks.storageClamp,
  },
}));
vi.mock('mongoose', () => ({
  default: {
    Types: { ObjectId: { isValid: mocks.isValidObjectId } },
    startSession: mocks.startSession,
  },
}));
vi.mock('@aws-sdk/client-s3', () => ({ DeleteObjectCommand: vi.fn() }));
vi.mock('../lib/s3-client', () => ({
  BUCKET_NAME: 'test-bucket',
  s3Client: { send: mocks.s3Send },
}));

import { resetStudentAcademicInfo } from '../lib/academicReset';

function sessionQuery(value: unknown) {
  return { session: vi.fn().mockResolvedValue(value) };
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'student-1',
    role: 'student',
    program: 'BSCS',
    batch: 'Fall 2025',
    domains: ['machine-learning'],
    projectId: null,
    save: mocks.userSave,
    ...overrides,
  };
}

describe('resetStudentAcademicInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isValidObjectId.mockReturnValue(true);
    mocks.s3Send.mockResolvedValue({});
    mocks.startSession.mockResolvedValue({
      abortTransaction: mocks.abortTransaction,
      commitTransaction: mocks.commitTransaction,
      endSession: mocks.endSession,
      startTransaction: mocks.startTransaction,
    });
    projectConstructor.mockImplementation(function (data) {
      return {
        _id: 'fresh-project',
        ...data,
        save: mocks.projectSave,
      };
    });
    mocks.userFindById.mockReturnValue(sessionQuery(student()));
    mocks.projectFindById.mockReturnValue(sessionQuery(null));
  });

  it('performs the same student reset state as the old dashboard branch', async () => {
    const currentStudent = student();
    mocks.userFindById.mockReturnValue(sessionQuery(currentStudent));

    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: 'BSAI',
        newBatch: 'Fall 2026',
        actor: 'student',
        enforceStudentCooldown: true,
      })
    ).resolves.toEqual({
      message: 'Program and Batch updated successfully. Your dashboard has been reset.',
      freedBytes: 0,
    });

    expect(currentStudent).toMatchObject({
      program: 'BSAI',
      batch: 'Fall 2026',
      supervisorId: null,
      projectId: 'fresh-project',
      status: 'Unassigned',
      remarks:
        'You changed your academic information and accepted the progress reset. Please choose a supervisor again or join a team to begin.',
      projectTitle: '',
      projectDesc: '',
      domain: '',
      domains: [],
      tools: '',
      pdfUrl: '',
      lastProgramBatchChangeAt: expect.any(Date),
    });
    expect(projectConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ domains: [] })
    );
    expect(mocks.commitTransaction).toHaveBeenCalledOnce();
  });

  it('deduplicates solo-project cleanup and refunds the storage ledger', async () => {
    const currentStudent = student({
      projectId: 'project-1',
      pdfUrl: 'https://bucket.example/proposals/project.pdf',
    });
    mocks.userFindById.mockReturnValue(sessionQuery(currentStudent));
    mocks.projectFindById.mockReturnValue(
      sessionQuery({
        _id: 'project-1',
        members: ['student-1'],
        pdfUrl: 'https://bucket.example/proposals/project.pdf',
        pdfSize: 100,
      })
    );
    mocks.voiceFind.mockReturnValue(
      sessionQuery([
        { _id: 'voice-1', blobUrl: 'voicenotes/voice-1.webm', fileSize: 20 },
      ])
    );
    mocks.voiceDeleteMany.mockReturnValue({ session: vi.fn().mockResolvedValue({}) });

    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: 'BSAI',
        newBatch: 'Fall 2026',
        actor: 'student',
        enforceStudentCooldown: true,
      })
    ).resolves.toMatchObject({ freedBytes: 120 });

    expect(mocks.s3Send).toHaveBeenCalledTimes(2);
    expect(mocks.voiceDeleteMany).toHaveBeenCalledWith({ _id: { $in: ['voice-1'] } });
    expect(mocks.projectFindByIdAndDelete).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ session: expect.any(Object) })
    );
    expect(mocks.storageDecrement).toHaveBeenCalledWith(
      { configKey: 'storage' },
      { $inc: { usedBytes: -120 } },
      expect.objectContaining({ upsert: true, session: expect.any(Object) })
    );
    expect(mocks.storageClamp).toHaveBeenCalledWith(
      { configKey: 'storage', usedBytes: { $lt: 0 } },
      { $set: { usedBytes: 0 } },
      expect.objectContaining({ session: expect.any(Object) })
    );
  });

  it('leaves a team project without deleting shared files or refunding its storage', async () => {
    const currentStudent = student({ projectId: 'project-1' });
    mocks.userFindById.mockReturnValue(sessionQuery(currentStudent));
    mocks.projectFindById.mockReturnValue(
      sessionQuery({
        _id: 'project-1',
        members: ['student-1', 'student-2'],
        pdfUrl: 'proposals/shared.pdf',
        pdfSize: 100,
      })
    );

    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: 'BSAI',
        newBatch: 'Fall 2026',
        actor: 'student',
        enforceStudentCooldown: true,
      })
    ).resolves.toMatchObject({ freedBytes: 0 });

    expect(mocks.projectFindByIdAndUpdate).toHaveBeenCalledWith(
      'project-1',
      { $pull: { members: 'student-1' } },
      expect.objectContaining({ session: expect.any(Object) })
    );
    expect(mocks.projectFindByIdAndDelete).not.toHaveBeenCalled();
    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.storageDecrement).not.toHaveBeenCalled();
  });

  it('enforces the student cooldown before changing project state', async () => {
    mocks.userFindById.mockReturnValue(
      sessionQuery(student({ lastProgramBatchChangeAt: new Date() }))
    );

    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: 'BSAI',
        newBatch: 'Fall 2026',
        actor: 'student',
        enforceStudentCooldown: true,
      })
    ).rejects.toMatchObject({ statusCode: 429 });

    expect(mocks.projectFindById).not.toHaveBeenCalled();
    expect(mocks.abortTransaction).toHaveBeenCalledOnce();
    expect(mocks.commitTransaction).not.toHaveBeenCalled();
  });

  it('aborts the transaction when creating the fresh project fails', async () => {
    mocks.projectSave.mockRejectedValueOnce(new Error('duplicate invite code exhausted'));

    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: 'BSAI',
        newBatch: 'Fall 2026',
        actor: 'student',
        enforceStudentCooldown: true,
      })
    ).rejects.toThrow('duplicate invite code exhausted');

    expect(mocks.abortTransaction).toHaveBeenCalledOnce();
    expect(mocks.commitTransaction).not.toHaveBeenCalled();
    expect(mocks.endSession).toHaveBeenCalledOnce();
  });

  it('preserves the admin partial-update response and leaves the cooldown untouched', async () => {
    const currentStudent = student();
    mocks.userFindById.mockReturnValue(sessionQuery(currentStudent));

    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: 'BSAI',
        actor: 'admin',
      })
    ).resolves.toEqual({
      message: 'Academic information updated by Admin. Student has been reset.',
      freedBytes: 0,
    });

    expect(currentStudent).toMatchObject({
      program: 'BSAI',
      batch: 'Fall 2025',
      remarks:
        'Your academic information was updated by an Admin. Please choose a supervisor again or join a team to begin.',
    });
    expect(currentStudent).not.toHaveProperty('lastProgramBatchChangeAt');
  });

  it('preserves student-only validation and unchanged-state responses', async () => {
    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: '',
        newBatch: 'Fall 2026',
        actor: 'student',
        enforceStudentCooldown: true,
      })
    ).rejects.toMatchObject({ message: 'Invalid program selected.', statusCode: 400 });

    await expect(
      resetStudentAcademicInfo({
        targetUserId: 'student-1',
        newProgram: 'BSCS',
        newBatch: 'Fall 2025',
        actor: 'student',
        enforceStudentCooldown: true,
      })
    ).rejects.toMatchObject({
      message: 'No changes selected. Program and Batch are already the same.',
      statusCode: 400,
    });
  });
});
