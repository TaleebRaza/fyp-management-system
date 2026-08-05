import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const activityLog = await importTypeScriptModule('lib/portalActivityLogPolicy.ts');

test('keeps activity storage atomically bounded to the latest 100 entries', () => {
  const update = activityLog.createPortalActivityUpdate({
    action: 'login',
    actorId: 'user-1',
    actorRole: 'student',
    actorName: 'Student One',
    actorRollNo: 'F23-0001',
  });
  const entries = update.$push.entries;

  assert.equal(entries.$position, 0);
  assert.equal(entries.$slice, 100);
  assert.equal(entries.$each.length, 1);
  assert.equal(entries.$each[0].action, 'login');
  assert.equal(entries.$each[0].actorName, 'Student One');
  assert.equal(entries.$each[0].actorRollNo, 'F23-0001');
  assert.ok(entries.$each[0].occurredAt instanceof Date);
});

test('maps every project review result to a readable activity action', () => {
  assert.equal(activityLog.projectReviewActivityAction('Approved'), 'project-approved');
  assert.equal(activityLog.projectReviewActivityAction('Rejected'), 'project-rejected');
  assert.equal(
    activityLog.projectReviewActivityAction('Changes Requested'),
    'project-changes-requested'
  );
});

test('the logs endpoint stays admin-only and disables caching', async () => {
  const source = await readFile(
    new URL('../app/api/admin/activity-logs/route.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /requireCurrentUser\(req, \['admin'\]\)/);
  assert.match(source, /Cache-Control': 'private, no-store'/);
  assert.match(source, /getPortalActivityPage\(parsePage/);
});

test('the admin dashboard loads the logs panel only for its Logs tab', async () => {
  const source = await readFile(
    new URL('../components/dashboards/AdminDashboard.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /\(\) => import\('\.\.\/admin\/AdminActivityLogsPanel'\)/);
  assert.match(source, /activeTab === 'logs' && <AdminActivityLogsPanel \/>/);
  assert.doesNotMatch(source, /useAdminActivityLogsPrefetch/);
});

test('records actor identity with the requested authentication and project review events', async () => {
  const [authRoute, passwordResetService, adminReviews, supervisorDashboard, authHelper, logPanel] = await Promise.all([
    readFile(new URL('../app/api/auth/[...nextauth]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/auth/passwordResetService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/project-reviews/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/dashboard/supervisor/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/security/auth.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminActivityLogsPanel.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(authRoute, /action: 'login'/);
  assert.match(authRoute, /action: 'logout'/);
  assert.match(authRoute, /actorName: user\.name/);
  assert.match(authRoute, /actorRollNo: user\.rollNo/);
  assert.match(passwordResetService, /action: 'password-changed'/);
  assert.match(adminReviews, /projectReviewActivityAction\(body\.status\)/);
  assert.match(supervisorDashboard, /recordCurrentUserActivity\(projectReviewActivityAction\(status\), currentUser\)/);
  assert.match(authHelper, /select\('_id role name rollNo'\)/);
  assert.match(logPanel, /entry\.actorName/);
  assert.match(logPanel, /entry\.actorRollNo/);
});
