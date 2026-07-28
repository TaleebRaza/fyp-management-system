import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardPath = path.join(root, 'components/dashboards/StudentDashboard.tsx');
const dashboard = readFileSync(dashboardPath, 'utf8');

test('installs the student dashboard API boundary', () => {
  assert.equal(
    existsSync(path.join(root, 'components/student/api/studentDashboardApi.ts')),
    true
  );
});

test('routes student loading, templates, upload, and submission through the API module', () => {
  for (const marker of [
    'getStudentHeadline',
    'getStudentDashboard',
    'getStudentSupervisors',
    'getStudentTemplates',
    'uploadStudentPdf',
    'submitStudentProject',
  ]) {
    assert.match(dashboard, new RegExp(`\\b${marker}\\b`));
  }

  assert.doesNotMatch(dashboard, /fetch\('\/api\/headline'/);
  assert.doesNotMatch(dashboard, /fetch\(`\/api\/templates\?stage=/);
  assert.doesNotMatch(dashboard, /fetch\('\/api\/upload'/);
  assert.doesNotMatch(dashboard, /tokenResponse/);
});

test('keeps the student team and account workflows connected for the next pass', () => {
  for (const marker of [
    'submitSupervisorRequest',
    'handleJoinTeam',
    'performLeaveTeam',
    'handleAcademicUpdate',
    'StudentOverviewSection',
    'StudentProjectSubmissionSection',
    'StudentTeamSection',
    'StudentResourcesSection',
  ]) {
    assert.match(dashboard, new RegExp(marker));
  }
});
