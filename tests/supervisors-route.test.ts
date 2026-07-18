import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  findSupervisors: vi.fn(),
  getToken: vi.fn(),
  projectAggregate: vi.fn(),
  userAggregate: vi.fn(),
}));

vi.mock('../lib/mongodb', () => ({ default: mocks.connectToDatabase }));
vi.mock('../models/User', () => ({
  default: {
    aggregate: mocks.userAggregate,
    find: mocks.findSupervisors,
  },
}));
vi.mock('../models/Project', () => ({
  default: { aggregate: mocks.projectAggregate },
}));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));

import { GET } from '../app/api/supervisors/route';

const supervisors = [
  {
    _id: 'supervisor-1',
    name: 'Dr Ada',
    rollNo: 'SUP-001',
    email: 'ada@example.com',
    password: 'must-not-leak',
    migrationCode: 'ADA123',
    notificationsEnabled: true,
    extraSlots: 4,
    resetCode: '123456',
  },
  {
    _id: 'supervisor-2',
    name: 'Dr Grace',
    rollNo: 'SUP-002',
    email: 'grace@example.com',
    password: 'also-secret',
    migrationCode: 'GRA456',
    notificationsEnabled: false,
    extraSlots: 0,
  },
];

function mockSupervisorQuery() {
  const query = {
    lean: vi.fn().mockResolvedValue(supervisors),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  mocks.findSupervisors.mockReturnValue(query);
  return query;
}

async function getSupervisors() {
  return GET(new NextRequest('http://localhost/api/supervisors'));
}

describe('GET /api/supervisors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getToken.mockResolvedValue(null);
    mocks.projectAggregate.mockResolvedValue([
      { _id: 'supervisor-1', count: 2 },
    ]);
    mockSupervisorQuery();
  });

  it('returns only registration-safe fields to anonymous callers', async () => {
    const response = await getSupervisors();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        _id: 'supervisor-1',
        name: 'Dr Ada',
        filledSlots: 2,
        isFull: false,
        maxSlots: 34,
      },
      {
        _id: 'supervisor-2',
        name: 'Dr Grace',
        filledSlots: 0,
        isFull: false,
        maxSlots: 30,
      },
    ]);
  });

  it('returns the operational fields required by the admin dashboard', async () => {
    mocks.getToken.mockResolvedValue({ id: 'admin-1', role: 'admin' });

    const response = await getSupervisors();

    expect(await response.json()).toEqual([
      {
        _id: 'supervisor-1',
        name: 'Dr Ada',
        rollNo: 'SUP-001',
        email: 'ada@example.com',
        migrationCode: 'ADA123',
        notificationsEnabled: true,
        extraSlots: 4,
        filledSlots: 2,
        isFull: false,
        maxSlots: 34,
      },
      {
        _id: 'supervisor-2',
        name: 'Dr Grace',
        rollNo: 'SUP-002',
        email: 'grace@example.com',
        migrationCode: 'GRA456',
        notificationsEnabled: false,
        extraSlots: 0,
        filledSlots: 0,
        isFull: false,
        maxSlots: 30,
      },
    ]);
  });

  it('does not return private fields to authenticated students', async () => {
    mocks.getToken.mockResolvedValue({ id: 'student-1', role: 'student' });

    const response = await getSupervisors();
    const body = await response.json();

    expect(body[0]).toEqual({
      _id: 'supervisor-1',
      name: 'Dr Ada',
      filledSlots: 2,
      isFull: false,
      maxSlots: 34,
    });
  });

  it('returns a supervisor migration code only on their own record', async () => {
    mocks.getToken.mockResolvedValue({ id: 'supervisor-1', role: 'supervisor' });

    const response = await getSupervisors();
    const body = await response.json();

    expect(body[0]).toMatchObject({
      _id: 'supervisor-1',
      rollNo: 'SUP-001',
      migrationCode: 'ADA123',
    });
    expect(body[0]).not.toHaveProperty('password');
    expect(body[0]).not.toHaveProperty('email');
    expect(body[1]).not.toHaveProperty('rollNo');
    expect(body[1]).not.toHaveProperty('migrationCode');
  });

  it('limits the database query to fields used by the response', async () => {
    const query = mockSupervisorQuery();

    await getSupervisors();

    expect(query.select).toHaveBeenCalledWith(
      '_id name rollNo email migrationCode notificationsEnabled extraSlots'
    );
  });
});
