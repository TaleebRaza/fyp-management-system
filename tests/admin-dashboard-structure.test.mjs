import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboardPath = path.join(root, 'components/dashboards/AdminDashboard.tsx');
const dashboard = readFileSync(dashboardPath, 'utf8');

const requiredFiles = [
  'components/admin/api/adminDashboardApi.ts',
  'components/admin/hooks/useAdminEmailUpdate.ts',
  'components/admin/hooks/useAdminHeadline.ts',
  'components/admin/hooks/useAdminProjectReviewPrefetch.ts',
  'components/admin/hooks/useAdminReports.ts',
  'components/admin/hooks/useAdminStudents.ts',
  'components/admin/hooks/useAdminSupervisors.ts',
  'components/admin/selectors/adminDashboardSelectors.ts',
];

test('installs each focused admin dashboard module', () => {
  for (const relativePath of requiredFiles) {
    assert.equal(existsSync(path.join(root, relativePath)), true, relativePath);
  }
});

test('reduces AdminDashboard to a focused composition component', () => {
  const lineCount = dashboard.split(/\r?\n/).length;
  assert.ok(lineCount <= 340, `AdminDashboard has ${lineCount} lines`);
  assert.match(dashboard, /useAdminStudents/);
  assert.match(dashboard, /useAdminSupervisors/);
  assert.match(dashboard, /useAdminReports/);
  assert.match(dashboard, /useAdminHeadline/);
});

test('removes direct networking and mutation implementations from the dashboard', () => {
  assert.doesNotMatch(dashboard, /\bfetch\s*\(/);
  assert.doesNotMatch(dashboard, /\/api\/admin\/update-/);
  assert.doesNotMatch(dashboard, /Math\.random/);
  assert.doesNotMatch(dashboard, /if\s*\(isReportsModalOpen\)\s*\{\s*\}/);
});

test('keeps every existing top-level admin section connected', () => {
  for (const marker of [
    'AdminOverviewSection',
    'AdminHeadlineSection',
    'AdminStudentsSection',
    'AdminSupervisorsSection',
    'AdminProjectReviewsPanel',
    'FineManagementPanel',
    'RegistrationControlPanel',
    'AdminReportsDialog',
    'SupervisorSlotEditorDialog',
  ]) {
    assert.match(dashboard, new RegExp(marker));
  }
});
