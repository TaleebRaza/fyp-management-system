import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin heavy data and review code load only when opened', async () => {
  const [dashboard, reportsHook] = await Promise.all([
    readFile(new URL('../components/dashboards/AdminDashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/hooks/useAdminReports.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(dashboard, /useAdminProjectReviewPrefetch/);
  assert.match(dashboard, /hasOpenedReviews &&/);
  assert.match(dashboard, /hidden=\{activeTab !== 'reviews'\}/);
  assert.match(reportsHook, /getAdminOverviewSummary\(\)/);
  assert.doesNotMatch(reportsHook, /setTimeout\([^)]*loadReports/);
  assert.match(reportsHook, /if \(!data && !isLoading\) await refreshReports\(\)/);
});
