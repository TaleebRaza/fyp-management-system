import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abortTransaction: vi.fn(),
  bcryptHash: vi.fn(),
  commitTransaction: vi.fn(),
  connectToDatabase: vi.fn(),
  endSession: vi.fn(),
  projectCountDocuments: vi.fn(),
  startSession: vi.fn(),
  startTransaction: vi.fn(),
  userFindOne: vi.fn(),
  userSave: vi.fn(),
  userUpdateOne: vi.fn(),
}));

const userConstructor = vi.hoisted(() => vi.fn());
const projectConstructor = vi.hoisted(() => vi.fn());

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: Object.assign(userConstructor, {
    findOne: mocks.userFindOne,
    updateOne: mocks.userUpdateOne,
  }),
}));
vi.mock('../models/Project', () => ({
  default: Object.assign(projectConstructor, {
    countDocuments: mocks.projectCountDocuments,
  }),
}));
vi.mock('bcryptjs', () => ({ default: { hash: mocks.bcryptHash } }));
vi.mock('mongoose', () => ({
  default: {
    Types: { ObjectId: { isValid: () => true } },
    startSession: mocks.startSession,
  },
}));

import { POST } from '../app/api/register/route';

function countQuery(count: number) {
  return {
    session: vi.fn().mockResolvedValue(count),
    then: (resolve: (value: number) => unknown) => Promise.resolve(count).then(resolve),
  };
}

function register() {
  return POST(new NextRequest('http://localhost/api/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Student One',
      email: 'student@example.com',
      rollNo: 'BSCS-2026-01',
      password: 'strong-password',
      supervisorId: 'supervisor-1',
      program: 'BSCS',
      batch: 'Fall 2026',
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/register capacity enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bcryptHash.mockResolvedValue('hashed-password');
    mocks.userFindOne.mockImplementation((query: { $or?: unknown }) => {
      if (query.$or) {
        return { select: () => ({ lean: () => Promise.resolve(null) }) };
      }

      return {
        select: () => ({
          session: () => Promise.resolve({ _id: 'supervisor-1', extraSlots: 0 }),
        }),
      };
    });
    mocks.userUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.projectCountDocuments.mockReturnValue(countQuery(29));
    userConstructor.mockImplementation(function (data) {
      return { ...data, _id: 'student-1', save: mocks.userSave };
    });
    projectConstructor.mockImplementation(function (data) {
      return { ...data, _id: 'project-1', save: mocks.userSave };
    });
    mocks.startSession.mockResolvedValue({
      abortTransaction: mocks.abortTransaction,
      commitTransaction: mocks.commitTransaction,
      endSession: mocks.endSession,
      inTransaction: vi.fn().mockReturnValue(true),
      startTransaction: mocks.startTransaction,
    });
  });

  it('reserves capacity inside the registration transaction before creating records', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { _id: 'supervisor-1', role: 'supervisor' },
      { $inc: { capacityVersion: 1 } },
      expect.objectContaining({ session: expect.any(Object) })
    );
    expect(userConstructor).toHaveBeenCalledWith(expect.objectContaining({
      supervisorId: 'supervisor-1',
      password: 'hashed-password',
    }));
    expect(mocks.commitTransaction).toHaveBeenCalledOnce();
  });

  it('rejects a full supervisor before creating a student or project', async () => {
    mocks.projectCountDocuments.mockReturnValue(countQuery(30));

    const response = await register();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Registration failed. The selected supervisor has reached maximum capacity (30 slots).',
    });
    expect(mocks.userUpdateOne).not.toHaveBeenCalled();
    expect(userConstructor).not.toHaveBeenCalled();
    expect(projectConstructor).not.toHaveBeenCalled();
  });
});
