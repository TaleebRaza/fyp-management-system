import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUri = process.env.VIVA_TEST_MONGODB_URI;

test(
  'restricts non-admin Viva panel members against an isolated MongoDB replica set',
  { skip: testDatabaseUri ? false : 'Set VIVA_TEST_MONGODB_URI to run the MongoDB integration test.' },
  async () => {
    assert.ok(testDatabaseUri);
    const { runVivaAccessRestrictionIntegration } = await import('./support/viva-access-restriction-runner.mjs');
    await runVivaAccessRestrictionIntegration(testDatabaseUri);
  }
);
