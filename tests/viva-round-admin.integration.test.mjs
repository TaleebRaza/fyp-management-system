import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUri = process.env.VIVA_TEST_MONGODB_URI;

test(
  'saves Viva round configuration against an isolated MongoDB replica set',
  { skip: testDatabaseUri ? false : 'Set VIVA_TEST_MONGODB_URI to run the MongoDB integration test.' },
  async () => {
    assert.ok(testDatabaseUri);
    const { runVivaRoundAdminIntegration } = await import('./support/viva-round-admin-runner.mjs');
    await runVivaRoundAdminIntegration(testDatabaseUri);
  }
);
