import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  distinct: vi.fn(),
  find: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: {
    distinct: mocks.distinct,
    find: mocks.find,
  },
}));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));

import { GET } from '../app/api/admin/students/route';

function listStudents() {
  return GET(new NextRequest('http://localhost/api/admin/students'));
}

describe('GET /api/admin/students', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.distinct.mockResolvedValue(['Fall 2025']);
    mocks.find.mockReturnValue({
      select: () => ({
        sort: () => ({ lean: () => Promise.resolve([]) }),
      }),
    });
  });

  it('rejects anonymous calls before database access', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await listStudents()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects non-admin calls before database access', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    expect((await listStudents()).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('preserves the unfiltered admin listing response', async () => {
    const response = await listStudents();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      students: [],
      pagination: { page: 1, limit: 0, total: 0, totalPages: 0 },
      filterMeta: { batches: ['Fall 2025'] },
    });
    expect(mocks.find).toHaveBeenCalledWith({ role: 'student' });
  });
});
