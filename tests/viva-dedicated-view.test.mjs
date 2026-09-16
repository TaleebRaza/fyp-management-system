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

  assert.match(workspace, /export function VivaShortcut/);
  assert.match(workspace, /export function VivaWorkspaceShell/);
  assert.match(adminDashboard, /<VivaShortcut onOpen=\{\(\) => setIsVivaView\(true\)\} \/>/);
  assert.match(adminDashboard, /<VivaWorkspaceShell/);
  assert.match(adminDashboard, /<AdminVivaSection \/>/);
  assert.doesNotMatch(adminDashboard, /activeTab === 'viva'/);
  assert.match(studentDashboard, /<VivaShortcut onOpen=\{\(\) => setIsVivaView\(true\)\} \/>/);
  assert.match(studentDashboard, /<StudentVivaWorkspace results=\{data\?\.vivaResults \|\| \[\]\} \/>/);
  assert.doesNotMatch(studentOverview, /StudentVivaResults/);
  assert.match(studentViva, /No Viva result published yet/);
  assert.match(adminViva, /VIVA_WORKSPACE_SECTIONS/);
  for (const section of ['setup', 'panels', 'schedule', 'results']) {
    assert.match(adminViva, new RegExp(`activeWorkspaceSection === '${section}'`));
  }
});
