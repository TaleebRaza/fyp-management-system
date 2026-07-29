import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(
  new URL('../components/dashboards/StudentDashboard.tsx', import.meta.url),
  'utf8'
);
const dataHook = await readFile(
  new URL('../components/student/hooks/useStudentDashboardData.ts', import.meta.url),
  'utf8'
);
const submissionHook = await readFile(
  new URL('../components/student/hooks/useStudentProjectSubmission.ts', import.meta.url),
  'utf8'
);
const navigationHook = await readFile(
  new URL('../components/student/hooks/useStudentDashboardNavigation.tsx', import.meta.url),
  'utf8'
);

test('student dashboard delegates data, view model, navigation, and submission', () => {
  assert.match(dashboard, /useStudentDashboardData\(\{/);
  assert.match(dashboard, /buildStudentDashboardViewModel\(data, headline, tools\)/);
  assert.match(dashboard, /useStudentDashboardNavigation\(/);
  assert.match(dashboard, /useStudentProjectSubmission\(\{/);
  assert.doesNotMatch(dashboard, /getStudentDashboard\(/);
  assert.doesNotMatch(dashboard, /getStudentHeadline\(/);
  assert.doesNotMatch(dashboard, /submitStudentProject\(/);
  assert.doesNotMatch(dashboard, /const navItems = \[/);
});

test('data hook keeps stale-response cleanup and API ownership', () => {
  assert.match(dataHook, /let cancelled = false/);
  assert.match(dataHook, /Promise\.allSettled/);
  assert.match(dataHook, /getStudentDashboard\(userId\)/);
  assert.match(dataHook, /getStudentSupervisors\(\)/);
  assert.match(dataHook, /return \(\) => \{/);
});

test('submission hook preserves validation, upload, and refresh order', () => {
  assert.match(submissionHook, /Fine payment required/);
  assert.match(submissionHook, /Missing project details/);
  assert.match(submissionHook, /PDF required/);
  assert.match(submissionHook, /await uploadStudentPdf\(file\)/);
  assert.match(submissionHook, /await clearStoredProjectDraft\(\)/);
  assert.match(submissionHook, /await refreshDashboard\(\)/);
});

test('navigation derives an unavailable fine tab without an effect', () => {
  assert.match(navigationHook, /requestedTab === 'fine' && !hasFineRestriction/);
  assert.doesNotMatch(navigationHook, /useEffect/);
  assert.match(navigationHook, /label: 'Fine Payment'/);
});
