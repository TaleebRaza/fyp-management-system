import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  abortTransaction: vi.fn(),
  bcryptHash: vi.fn(),
  commitTransaction: vi.fn(),
  connectToDatabase: vi.fn(),
  endSession: vi.fn(),
  getToken: vi.fn(),
  projectUpdateMany: vi.fn(),
  startSession: vi.fn(),
  startTransaction: vi.fn(),
  userFindByIdAndDelete: vi.fn(),
  userSave: vi.fn(),
  userUpdateMany: vi.fn(),
}));

const userConstructor = vi.hoisted(() => vi.fn());

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: Object.assign(userConstructor, {
    findByIdAndDelete: mocks.userFindByIdAndDelete,
    updateMany: mocks.userUpdateMany,
  }),
}));
vi.mock('../models/Project', () => ({ default: { updateMany: mocks.projectUpdateMany } }));
vi.mock('bcryptjs', () => ({ default: { hash: mocks.bcryptHash } }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('mongoose', () => ({ default: { startSession: mocks.startSession } }));

import { POST as addSupervisor } from '../app/api/add-supervisor/route';
import { POST as deleteSupervisor } from '../app/api/delete-supervisor/route';

function add() {
  return addSupervisor(new NextRequest('http://localhost/api/add-supervisor', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Dr Ada',
      email: 'ada@example.com',
      rollNo: 'SUP-001',
      password: 'strong-password',
      migrationCode: 'ADA001',
    }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

function remove() {
  return deleteSupervisor(new NextRequest('http://localhost/api/delete-supervisor', {
    method: 'POST',
    body: JSON.stringify({ id: 'supervisor-1' }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('admin-only supervisor mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.bcryptHash.mockResolvedValue('hashed-password');
    userConstructor.mockImplementation(function (data) {
      return { ...data, save: mocks.userSave };
    });
    mocks.startSession.mockResolvedValue({
      abortTransaction: mocks.abortTransaction,
      commitTransaction: mocks.commitTransaction,
      endSession: mocks.endSession,
      startTransaction: mocks.startTransaction,
    });
    mocks.userFindByIdAndDelete.mockResolvedValue({ _id: 'supervisor-1' });
  });

  it('rejects anonymous supervisor mutations before database access', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await add()).status).toBe(401);
    expect((await remove()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects student supervisor mutations', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    expect((await add()).status).toBe(403);
    expect((await remove()).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('keeps the valid admin supervisor-creation flow', async () => {
    const response = await add();

    expect(response.status).toBe(201);
    expect(mocks.bcryptHash).toHaveBeenCalledWith('strong-password', 10);
    expect(userConstructor).toHaveBeenCalledWith(expect.objectContaining({
      password: 'hashed-password',
      role: 'supervisor',
    }));
    expect(mocks.userSave).toHaveBeenCalledOnce();
  });

  it('keeps the valid admin supervisor-deletion transaction', async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    expect(mocks.userFindByIdAndDelete).toHaveBeenCalledWith(
      'supervisor-1',
      expect.objectContaining({ session: expect.any(Object) })
    );
    expect(mocks.userUpdateMany).toHaveBeenCalledWith(
      { supervisorId: 'supervisor-1' },
      expect.objectContaining({ $set: expect.objectContaining({ supervisorId: null }) }),
      expect.objectContaining({ session: expect.any(Object) })
    );
    expect(mocks.projectUpdateMany).toHaveBeenCalledWith(
      { supervisorId: 'supervisor-1' },
      { $set: { supervisorId: null } },
      expect.objectContaining({ session: expect.any(Object) })
    );
    expect(mocks.commitTransaction).toHaveBeenCalledOnce();
  });
});
