import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const api = await importTypeScriptModule(
  'components/student/api/studentWorkflowApi.ts'
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

test('preserves assign-supervisor request contract', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/dashboard/student');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), {
      action: 'assignSupervisor',
      id: 'student-1',
      supervisorId: 'supervisor-2',
    });
    return jsonResponse({ message: 'Assigned' });
  }, async () => {
    const result = await api.updateStudentSupervisor({
      action: 'assignSupervisor',
      id: 'student-1',
      supervisorId: 'supervisor-2',
    });
    assert.equal(result.message, 'Assigned');
  });
});

test('preserves change-supervisor request contract', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/dashboard/student');
    assert.deepEqual(JSON.parse(init.body), {
      action: 'changeSupervisor',
      id: 'student-1',
      supervisorId: 'supervisor-3',
    });
    return jsonResponse({ message: 'Changed' });
  }, async () => {
    await api.updateStudentSupervisor({
      action: 'changeSupervisor',
      id: 'student-1',
      supervisorId: 'supervisor-3',
    });
  });
});

test('normal team join uses the existing endpoint and JSON body', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/project/join');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), { inviteCode: 'ABC123' });
    return jsonResponse({ message: 'Joined' });
  }, async () => {
    const result = await api.joinStudentTeam('ABC123');
    assert.equal(result.message, 'Joined');
  });
});

test('leave team preserves the bodyless POST contract', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/project/leave');
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
    assert.equal('body' in init, false);
    return jsonResponse({ message: 'Left' });
  }, async () => {
    const result = await api.leaveStudentTeam();
    assert.equal(result.message, 'Left');
  });
});

test('academic update preserves action and field names', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/dashboard/student');
    assert.deepEqual(JSON.parse(init.body), {
      action: 'updateProgramBatch',
      id: 'student-1',
      program: 'BSAI',
      batch: 'Fall 2025',
    });
    return jsonResponse({ message: 'Updated' });
  }, async () => {
    await api.updateStudentAcademicInfo({
      id: 'student-1',
      program: 'BSAI',
      batch: 'Fall 2025',
    });
  });
});

test('workflow API propagates server error messages', async () => {
  await withMockFetch(
    async () => jsonResponse({ error: 'Supervisor slots are full.' }, { ok: false }),
    async () => {
      await assert.rejects(
        () =>
          api.updateStudentSupervisor({
            action: 'assignSupervisor',
            id: 'student-1',
            supervisorId: 'supervisor-2',
          }),
        /Supervisor slots are full\./
      );
    }
  );
});
