import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('project reset safely creates a fresh unassigned proposal project', async () => {
  const [route, teamSection, teamActions] = await Promise.all([
    read('app/api/dashboard/student/route.ts'),
    read('components/student/StudentTeamSection.tsx'),
    read('components/student/hooks/useStudentTeamActions.ts'),
  ]);
  const actionStart = route.indexOf("if (action === 'resetProject')");
  const actionEnd = route.indexOf('// ACTION: CHANGE SUPERVISOR', actionStart);
  const resetAction = route.slice(actionStart, actionEnd);

  assert.ok(actionStart >= 0);
  assert.match(resetAction, /withStorageTransaction/);
  assert.match(resetAction, /VoiceNote\.find/);
  assert.match(resetAction, /VoiceNote\.deleteMany/);
  assert.match(resetAction, /student\.studentMessageId = null/);
  assert.match(resetAction, /student\.studentMessageContent = null/);
  assert.match(resetAction, /isOnlyMember\s*\? \[\{ key: currentProject\.pdfUrl/);
  assert.match(resetAction, /enqueueStorageDeletion\(\{ \.\.\.target, reason: 'student-project-reset' \}/);
  assert.match(resetAction, /\$pull: \{ members: student\._id \}/);
  assert.match(resetAction, /releaseSupervisorProjectSlot/);
  assert.match(resetAction, /supervisorId: null/);
  assert.match(resetAction, /stage: 'PROPOSAL'/);
  assert.match(teamSection, /Reset Project/);
  assert.match(teamActions, /type: 'confirm'/);
  assert.match(teamActions, /This permanently removes your supervisor/);
});
