import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUri = process.env.PORTAL_PAUSE_TEST_MONGODB_URI;

test(
  'coalesces, expires, and invalidates portal pause reads',
  { skip: testDatabaseUri ? false : 'Set PORTAL_PAUSE_TEST_MONGODB_URI to run the MongoDB integration test.' },
  async () => {
    assert.ok(testDatabaseUri);
    process.env.MONGODB_URI = testDatabaseUri;
    const { runPortalPauseCacheIntegration } = await import('./support/portal-pause-cache-runner.mjs');
    await runPortalPauseCacheIntegration(testDatabaseUri);
  }
);
