import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Viva has focused admin and student workspaces', async () => {
  const [adminDashboard, adminViva, panelManagement, scheduleManagement, studentDashboard, studentOverview, studentViva, workspace] = await Promise.all([
    read('components/dashboards/AdminDashboard.tsx'),
    read('components/admin/AdminVivaSection.tsx'),
    read('components/admin/VivaPanelManagement.tsx'),
    read('components/admin/VivaScheduleManagement.tsx'),
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
  assert.match(studentViva, /No Viva session yet/);
  assert.match(studentViva, /session\.panel\.admin\.name/);
  assert.match(adminViva, /VIVA_WORKSPACE_SECTIONS/);
  assert.match(adminViva, /id="viva-round-selector"/);
  assert.doesNotMatch(adminViva, /window\.confirm/);
  assert.match(adminViva, /<Dialog/);
  assert.match(panelManagement, /hasUnassignedTeachers/);
  assert.match(panelManagement, /hasScheduledSessions/);
  assert.match(panelManagement, /Panels Saved/);
  assert.match(panelManagement, /pendingAction/);
  assert.match(panelManagement, /<Dialog/);
  assert.match(panelManagement, /MoveRight size=\{20\}/);
  assert.match(panelManagement, /ArrowLeftRight size=\{20\}/);
  assert.match(panelManagement, /UserMinus size=\{20\}/);
  for (const section of ['setup', 'panels', 'schedule']) {
    assert.match(adminViva, new RegExp(`activeWorkspaceSection === '${section}'`));
  }
  assert.doesNotMatch(adminViva, /activeWorkspaceSection === 'results'/);
  assert.doesNotMatch(adminViva, /VivaResultPublication/);
  assert.match(scheduleManagement, /panelRooms: draft\.panelRooms/);
  assert.match(scheduleManagement, /View held teams/);
  assert.match(scheduleManagement, /Confirm schedule/);
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

test('completing a Viva updates its card and moves it below unfinished sessions', async () => {
  const [supervisorWorkspace, supervisorRoute] = await Promise.all([
    read('components/supervisor/VivaSessionWorkspace.tsx'),
    read('app/api/dashboard/supervisor/viva/route.ts'),
  ]);
  const completionStart = supervisorWorkspace.indexOf('const completeSession');
  const completionCatch = supervisorWorkspace.indexOf('    } catch (requestError)', completionStart);
  const completionSuccessPath = supervisorWorkspace.slice(completionStart, completionCatch);

  assert.ok(completionStart >= 0 && completionCatch > completionStart);
  assert.match(supervisorWorkspace, /setSessions\(orderSessions\(nextSessions\)\)/);
  assert.match(completionSuccessPath, /readSession\(body\.session\)/);
  assert.match(completionSuccessPath, /setSessions\(\(current\) => orderSessions\(current\.map/);
  assert.doesNotMatch(completionSuccessPath, /await loadSessions\(\)/);
  assert.match(supervisorRoute, /session: result\.workspace/);
});
