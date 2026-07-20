import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getToken: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({ default: { updateMany: mocks.updateMany } }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));

import { POST } from '../app/api/admin/promote-batch/route';

function promote(targetBatch?: string) {
  return POST(new NextRequest('http://localhost/api/admin/promote-batch', {
    method: 'POST',
    body: JSON.stringify({ targetBatch }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/admin/promote-batch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mocks.updateMany.mockResolvedValue({ modifiedCount: 3 });
  });

  it('rejects anonymous calls before database access', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await promote('Fall 2025')).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects non-admin calls before database access', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    expect((await promote('Fall 2025')).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('preserves missing-batch validation for admins', async () => {
    const response = await promote();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Batch is required' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('preserves the valid admin promotion', async () => {
    const response = await promote('Fall 2025');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'Successfully promoted 3 students in Fall 2025 to 8th Semester!',
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      { role: 'student', batch: 'Fall 2025' },
      { $set: { semester: '8th Semester' } }
    );
  });
});
