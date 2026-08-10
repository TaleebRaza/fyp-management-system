import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin navigation is grouped in the shared left sidebar', async () => {
  const [dashboard, shell] = await Promise.all([
    readFile(new URL('../components/dashboards/AdminDashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ui/dashboard/DashboardShell.tsx', import.meta.url), 'utf8'),
  ]);

  for (const section of ['Dashboard', 'People', 'Portal Operations', 'Insights & Audit']) {
    assert.ok(dashboard.includes(`section: '${section}'`));
  }

  assert.match(shell, /role=\{section \? 'group' : undefined\}/);
  assert.match(shell, /overflow-y-auto/);
});
