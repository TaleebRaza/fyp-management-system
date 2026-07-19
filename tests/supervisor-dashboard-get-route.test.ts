import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  getToken: vi.fn(),
  projectFind: vi.fn(),
  userFind: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: { find: mocks.userFind },
}));
vi.mock('../models/Project', () => ({
  default: { find: mocks.projectFind },
}));
vi.mock('../models/SystemConfig', () => ({ default: {} }));
vi.mock('../lib/mailer', () => ({ sendNotificationEmail: vi.fn() }));
vi.mock('../lib/s3-client', () => ({ BUCKET_NAME: 'test-bucket', s3Client: {} }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('mongoose', () => ({ default: {}, ClientSession: {} }));

import { GET } from '../app/api/dashboard/supervisor/route';

function leanQuery(value: unknown) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

function getDashboard(id: string | null = 'supervisor-1') {
  const query = id ? `?id=${id}` : '';
  return GET(new NextRequest(`http://localhost/api/dashboard/supervisor${query}`));
}

describe('GET /api/dashboard/supervisor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });
    mocks.userFind.mockReturnValue(leanQuery([]));
    mocks.projectFind.mockReturnValue(leanQuery([]));
  });

  it('rejects anonymous requests before querying students', async () => {
    mocks.getToken.mockResolvedValue(null);

    const response = await getDashboard();

    expect(response.status).toBe(401);
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it('rejects student-role requests', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    const response = await getDashboard();

    expect(response.status).toBe(403);
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it('rejects a missing supervisor ID', async () => {
    const response = await getDashboard(null);

    expect(response.status).toBe(400);
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it('returns a supervisor own projects', async () => {
    const response = await getDashboard();

    expect(response.status).toBe(200);
    expect(mocks.userFind).toHaveBeenCalledWith({
      role: 'student',
      supervisorId: 'supervisor-1',
    });
  });

  it('rejects a supervisor requesting another supervisor projects', async () => {
    const response = await getDashboard('supervisor-2');

    expect(response.status).toBe(403);
    expect(mocks.userFind).not.toHaveBeenCalled();
  });

  it('allows an admin to inspect a supervisor projects', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const response = await getDashboard('supervisor-2');

    expect(response.status).toBe(200);
    expect(mocks.userFind).toHaveBeenCalledWith({
      role: 'student',
      supervisorId: 'supervisor-2',
    });
  });
});
