import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Viva has focused admin and student workspaces', async () => {
  const [adminDashboard, adminViva, studentDashboard, studentOverview, studentViva, workspace] = await Promise.all([
    read('components/dashboards/AdminDashboard.tsx'),
    read('components/admin/AdminVivaSection.tsx'),
    read('components/dashboards/StudentDashboard.tsx'),
    read('components/student/StudentOverviewSection.tsx'),
    read('components/student/StudentVivaWorkspace.tsx'),
    read('components/ui/dashboard/VivaWorkspace.tsx'),
  ]);

  assert.match(workspace, /export function VivaWorkspaceShell/);
  assert.doesNotMatch(workspace, /VivaShortcut/);
  assert.doesNotMatch(adminDashboard, /VivaShortcut/);
  assert.match(adminDashboard, /<VivaWorkspaceShell/);
  assert.match(adminDashboard, /<AdminVivaSection \/>/);
  assert.doesNotMatch(adminDashboard, /activeTab === 'viva'/);
  assert.doesNotMatch(studentDashboard, /VivaShortcut/);
  assert.match(studentDashboard, /<StudentVivaWorkspace results=\{data\?\.vivaResults \|\| \[\]\} sessions=\{data\?\.vivaSessions \|\| \[\]\} \/>/);
  assert.doesNotMatch(studentOverview, /StudentVivaResults/);
  assert.match(studentViva, /No Viva result published yet/);
  assert.match(adminViva, /VIVA_WORKSPACE_SECTIONS/);
  for (const section of ['setup', 'panels', 'schedule', 'results']) {
    assert.match(adminViva, new RegExp(`activeWorkspaceSection === '${section}'`));
  }
});

test('Viva setup exposes only eligible teams', async () => {
  const [adminViva, vivaRoundAdmin] = await Promise.all([
    read('components/admin/AdminVivaSection.tsx'),
    read('lib/vivaRoundAdmin.ts'),
  ]);

  assert.doesNotMatch(adminViva, /Deselect untitled/);
  assert.doesNotMatch(vivaRoundAdmin, /hasTitle/);
  assert.match(vivaRoundAdmin, /Every selected team needs a title and assigned supervisor/);
});
