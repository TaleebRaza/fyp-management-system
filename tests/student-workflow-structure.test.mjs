import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(
  new URL('../components/dashboards/StudentDashboard.tsx', import.meta.url),
  'utf8'
);
const supervisorHook = await readFile(
  new URL('../components/student/hooks/useStudentSupervisorActions.ts', import.meta.url),
  'utf8'
);
const teamHook = await readFile(
  new URL('../components/student/hooks/useStudentTeamActions.ts', import.meta.url),
  'utf8'
);
const academicHook = await readFile(
  new URL('../components/student/hooks/useStudentAcademicUpdate.ts', import.meta.url),
  'utf8'
);
const fineHook = await readFile(
  new URL('../components/student/hooks/useStudentFineRefresh.ts', import.meta.url),
  'utf8'
);

test('student dashboard delegates mutation workflows', () => {
  assert.match(dashboard, /useStudentSupervisorActions\(\{/);
  assert.match(dashboard, /useStudentTeamActions\(\{/);
  assert.match(dashboard, /useStudentAcademicUpdate\(\{/);
  assert.match(dashboard, /useStudentFineRefresh\(\{/);
  assert.doesNotMatch(dashboard, /fetch\('\/api\/project\/join'/);
  assert.doesNotMatch(dashboard, /fetch\('\/api\/project\/leave'/);
  assert.doesNotMatch(dashboard, /action: 'updateProgramBatch'/);
  assert.doesNotMatch(dashboard, /const submitSupervisorRequest/);
});

test('supervisor hook owns assignment and change resets', () => {
  assert.match(supervisorHook, /updateStudentSupervisor\(\{/);
  assert.match(supervisorHook, /await resetProjectDraft\(\)/);
  assert.match(supervisorHook, /resetTemplates\(\)/);
  assert.match(supervisorHook, /Supervisor change locked/);
});

test('team hook owns normalization, leave confirmation, and clipboard copy', () => {
  assert.match(teamHook, /trim\(\)\.toUpperCase\(\)/);
  assert.match(teamHook, /joinStudentTeam\(normalizedInviteCode\)/);
  assert.match(teamHook, /leaveStudentTeam\(\)/);
  assert.match(teamHook, /type: 'confirm'/);
  assert.match(teamHook, /navigator\.clipboard\.writeText\(inviteCode\)/);
});

test('academic and fine hooks own their focused workflows', () => {
  assert.match(academicHook, /updateStudentAcademicInfo\(\{/);
  assert.match(academicHook, /new Date\(\)\.getFullYear\(\) \+ 1/);
  assert.match(fineHook, /document\.addEventListener\('visibilitychange'/);
  assert.doesNotMatch(fineHook, /setState|useState/);
});
