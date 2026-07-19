import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getToken: vi.fn(),
  userFindByIdAndUpdate: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: { findByIdAndUpdate: mocks.userFindByIdAndUpdate },
}));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));

import { POST } from '../app/api/admin/toggle-student/route';

function toggle() {
  return POST(new NextRequest('http://localhost/api/admin/toggle-student', {
    method: 'POST',
    body: JSON.stringify({ studentId: 'student-1', isActive: false }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('admin-only student activation changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.userFindByIdAndUpdate.mockResolvedValue({ _id: 'student-1' });
  });

  it('rejects anonymous requests before database access', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await toggle()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects non-admin requests before database access', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    expect((await toggle()).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('keeps the valid admin activation update', async () => {
    const response = await toggle();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Student account deactivated successfully',
    });
    expect(mocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      'student-1',
      { isActive: false },
      { new: true }
    );
  });
});
