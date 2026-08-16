import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const supervisorApi = await importTypeScriptModule(
  'components/supervisor/api/supervisorDashboardApi.ts'
);
const {
  expandSupervisorTeam,
  loadSupervisorDashboard,
  migrateSupervisorStudent,
  removeSupervisorTeam,
  updateSupervisorProjectStatus,
} = supervisorApi;

function jsonResponse(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    },
  };
}

test('dashboard loading keeps the existing endpoint and normalizes its response', async () => {
  const calls = [];
  const projects = [{ _id: 'p1', triggerStudentId: 's1' }];
  const result = await loadSupervisorDashboard(async (...args) => {
    calls.push(args);
    return jsonResponse({ projects, migrationCode: 'ABC123' });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/dashboard/supervisor');
  assert.equal(calls[0][1], undefined);
  assert.deepEqual(result, { projects, migrationCode: 'ABC123' });
});

test('status updates preserve the current action payload', async () => {
  const calls = [];
  await updateSupervisorProjectStatus(
    {
      studentId: 'student-1',
      status: 'Approved',
      remarks: 'Looks good.',
      expectedStage: 'PROPOSAL',
      expectedVersion: 4,
      ratings: {
        projectIdea: 8,
        technicalMerit: 7,
        documentationQuality: 9,
      },
    },
    async (...args) => {
      calls.push(args);
      return jsonResponse({ message: 'Updated' });
    }
  );

  assert.equal(calls[0][0], '/api/dashboard/supervisor');
  assert.deepEqual(calls[0][1], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'updateStatus',
      studentId: 'student-1',
      status: 'Approved',
      remarks: 'Looks good.',
      expectedStage: 'PROPOSAL',
      expectedVersion: 4,
      ratings: {
        projectIdea: 8,
        technicalMerit: 7,
        documentationQuality: 9,
      },
    }),
  });
});

test('migration, expansion, and removal keep their existing request bodies', async () => {
  const bodies = [];
  const fetchImpl = async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return jsonResponse({ message: 'Done' });
  };

  await migrateSupervisorStudent(
    { studentId: 'student-2', migrationCode: 'TARGET' },
    fetchImpl
  );
  await expandSupervisorTeam('project-2', fetchImpl);
  await removeSupervisorTeam('student-3', fetchImpl);

  assert.deepEqual(bodies, [
    {
      action: 'migrate',
      studentId: 'student-2',
      migrationCode: 'TARGET',
    },
    { action: 'expandTeam', projectId: 'project-2' },
    { action: 'removeStudent', studentId: 'student-3' },
  ]);
});

test('API errors use the server message without hiding it', async () => {
  await assert.rejects(
    () =>
      expandSupervisorTeam('project-1', async () =>
        jsonResponse(
          { error: 'Only the assigned supervisor can expand this team.' },
          { ok: false, status: 403 }
        )
      ),
    /Only the assigned supervisor can expand this team\./
  );
});

test('supervisor API no longer contains a server-side file export client', () => {
  assert.equal('fetchSupervisorExport' in supervisorApi, false);
});
