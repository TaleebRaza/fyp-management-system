import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getToken: vi.fn(), connectToDatabase: vi.fn(), userFindById: vi.fn() }));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({ default: { findById: mocks.userFindById } }));
vi.mock('../models/Project', () => ({ default: {} }));
vi.mock('../lib/transactionUtils', () => ({ withTransactionRetry: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));
vi.mock('mongoose', () => ({ default: {} }));

import { POST } from '../app/api/project/join/route';

function join(studentId = 'student-1') {
  return POST(new NextRequest('http://localhost/api/project/join', {
    method: 'POST',
    body: JSON.stringify({ studentId, inviteCode: 'JOINME' }),
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('POST /api/project/join', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });
  });

  it('rejects anonymous requests before connecting to the database', async () => {
    mocks.getToken.mockResolvedValue(null);

    expect((await join()).status).toBe(401);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });

  it('rejects a non-student, non-admin role', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    expect((await join()).status).toBe(403);
  });

  it('rejects a student trying to join as another student', async () => {
    expect((await join('student-2')).status).toBe(403);
    expect(mocks.connectToDatabase).not.toHaveBeenCalled();
  });
});
