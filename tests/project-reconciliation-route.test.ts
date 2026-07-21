import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getToken: vi.fn(),
  projectFind: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('../models/Project', () => ({ default: { find: mocks.projectFind } }));
vi.mock('../models/User', () => ({ default: { find: mocks.userFind } }));

import { GET } from '../app/api/admin/project-reconciliation/route';

function selectLean(value: unknown) {
  return { select: () => ({ lean: () => Promise.resolve(value) }) };
}

function reconcile() {
  return GET(new NextRequest('http://localhost/api/admin/project-reconciliation'));
}

describe('GET /api/admin/project-reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.userFind.mockReturnValue(selectLean([
      { _id: 'student-1', projectId: 'project-1', supervisorId: 'supervisor-1', status: 'Pending' },
    ]));
    mocks.projectFind.mockReturnValue(selectLean([
      { _id: 'project-1', members: ['student-1'], supervisorId: 'supervisor-1', status: 'Pending' },
    ]));
  });

  it('rejects anonymous callers before database reads', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await reconcile()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
    expect(mocks.userFind).not.toHaveBeenCalled();
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it('returns an admin-only read-only reconciliation report', async () => {
    const response = await reconcile();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      studentCount: 1,
      projectCount: 1,
      matching: { count: 1, projectIds: ['project-1'] },
      missing: { projects: [], students: [] },
      conflicts: { memberships: [], fields: [] },
      orphaned: { projectIds: [] },
    });
    expect(mocks.userFind).toHaveBeenCalledWith({ role: 'student' });
    expect(mocks.projectFind).toHaveBeenCalledWith({});
  });
});
