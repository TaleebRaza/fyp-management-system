import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const api = await importTypeScriptModule(
  'components/admin/api/adminDashboardApi.ts'
);

function jsonResponse(data, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

async function withMockFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('builds the student query without sending All filters', () => {
  const params = api.buildAdminStudentSearchParams({
    page: 2,
    limit: 20,
    studentFilter: 'All',
    batchFilter: 'All',
    search: '',
    programCodes: ['BSCS', 'BSAI'],
  });

  assert.equal(params.toString(), 'page=2&limit=20');
});

test('builds program, batch, and search student query parameters', () => {
  const params = api.buildAdminStudentSearchParams({
    page: 3,
    limit: 20,
    studentFilter: 'BSAI',
    batchFilter: 'Fall 2023',
    search: 'taleeb',
    programCodes: ['BSCS', 'BSAI'],
  });

  assert.equal(
    params.toString(),
    'page=3&limit=20&program=BSAI&batch=Fall+2023&search=taleeb'
  );
});

test('passes the next-page cursor without changing the page label contract', () => {
  const params = api.buildAdminStudentSearchParams({
    page: 2,
    limit: 20,
    studentFilter: 'All',
    batchFilter: 'All',
    search: '',
    programCodes: ['BSCS'],
    cursor: 'next-page-token',
  });

  assert.equal(params.toString(), 'page=2&limit=20&cursor=next-page-token');
});

test('loads students through the unchanged admin students endpoint', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(
      url,
      '/api/admin/students?page=1&limit=20&status=Pending'
    );
    assert.deepEqual(init, { cache: 'no-store' });
    return jsonResponse({ students: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  }, async () => {
    const result = await api.getAdminStudents({
      page: 1,
      limit: 20,
      studentFilter: 'Pending',
      batchFilter: 'All',
      search: '',
      programCodes: ['BSCS', 'BSAI'],
    });
    assert.deepEqual(result.students, []);
  });
});

test('creates supervisors with the unchanged endpoint and JSON body', async () => {
  const input = {
    name: 'Supervisor One',
    email: 'supervisor@example.com',
    rollNo: 'SUP-01',
    password: 'temporary-password',
    migrationCode: 'ABC123',
  };

  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/add-supervisor');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), input);
    return jsonResponse({ message: 'Created' });
  }, async () => {
    const result = await api.createAdminSupervisor(input);
    assert.equal(result.ok, true);
    assert.equal(result.data.message, 'Created');
  });
});

test('preserves the update-email request contract', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/admin/update-email');
    assert.deepEqual(JSON.parse(init.body), {
      targetUserId: 'user-1',
      newEmail: 'new@example.com',
    });
    return jsonResponse({ email: 'new@example.com' });
  }, async () => {
    const result = await api.updateAdminEmail('user-1', 'new@example.com');
    assert.equal(result.data.email, 'new@example.com');
  });
});

test('preserves student reset and status mutation request bodies', async () => {
  const calls = [];
  await withMockFetch(async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    return jsonResponse({});
  }, async () => {
    await api.updateStudentProgram('student-1', 'BSAI');
    await api.updateStudentBatch('student-1', 'Fall 2024');
    await api.promoteStudentBatch('Fall 2024');
    await api.toggleAdminStudent('student-1', false);
  });

  assert.deepEqual(calls, [
    ['/api/admin/update-program', { targetUserId: 'student-1', newProgram: 'BSAI' }],
    ['/api/admin/update-batch', { targetUserId: 'student-1', newBatch: 'Fall 2024' }],
    ['/api/admin/promote-batch', { targetBatch: 'Fall 2024' }],
    ['/api/admin/toggle-student', { studentId: 'student-1', isActive: false }],
  ]);
});

test('preserves supervisor notification and slot request bodies', async () => {
  const calls = [];
  await withMockFetch(async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    return jsonResponse({});
  }, async () => {
    await api.setSupervisorNotifications('supervisor-1', true);
    await api.updateSupervisorExtraSlots('supervisor-1', 4);
    await api.deleteAdminSupervisor('supervisor-1');
  });

  assert.deepEqual(calls, [
    ['/api/supervisors/toggle-notifications', { id: 'supervisor-1', enabled: true }],
    ['/api/admin/update-supervisor-slots', { supervisorId: 'supervisor-1', extraSlots: 4 }],
    ['/api/delete-supervisor', { id: 'supervisor-1' }],
  ]);
});

test('does not prefetch review data when the admin dashboard loads', () => {
  assert.equal('prefetchAdminProjectReviews' in api, false);
});
