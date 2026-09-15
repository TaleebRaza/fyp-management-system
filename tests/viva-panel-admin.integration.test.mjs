import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUri = process.env.VIVA_TEST_MONGODB_URI;

test(
  'manages Viva panels against an isolated MongoDB replica set',
  { skip: testDatabaseUri ? false : 'Set VIVA_TEST_MONGODB_URI to run the MongoDB integration test.' },
  async () => {
    assert.ok(testDatabaseUri);
    const { runVivaPanelAdminIntegration } = await import('./support/viva-panel-admin-runner.mjs');
    await runVivaPanelAdminIntegration(testDatabaseUri);
  }
);
