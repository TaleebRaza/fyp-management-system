import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const testDatabaseUri = process.env.VIVA_TEST_MONGODB_URI;

test('hides saved supervisor Viva assignments until the round is confirmed', async () => {
  const source = await readFile(
    new URL('../lib/vivaSessionDashboard.ts', import.meta.url),
    'utf8'
  );

  assert.match(
    source,
    /VivaRound\.find\(\{ _id: \{ \$in: roundIds \}, confirmedAt: \{ \$type: 'date' \} \}\)/
  );
});

test(
  'starts panel-admin Viva sessions against an isolated MongoDB replica set',
  { skip: testDatabaseUri ? false : 'Set VIVA_TEST_MONGODB_URI to run the MongoDB integration test.' },
  async () => {
    assert.ok(testDatabaseUri);
    const { runVivaSessionDashboardIntegration } = await import('./support/viva-session-dashboard-runner.mjs');
    await runVivaSessionDashboardIntegration(testDatabaseUri);
  }
);
