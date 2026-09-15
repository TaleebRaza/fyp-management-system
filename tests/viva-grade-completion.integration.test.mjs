import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUri = process.env.VIVA_TEST_MONGODB_URI;

test(
  'saves and completes Viva grades against an isolated MongoDB replica set',
  { skip: testDatabaseUri ? false : 'Set VIVA_TEST_MONGODB_URI to run the MongoDB integration test.' },
  async () => {
    assert.ok(testDatabaseUri);
    const { runVivaGradeCompletionIntegration } = await import('./support/viva-grade-completion-runner.mjs');
    await runVivaGradeCompletionIntegration(testDatabaseUri);
  }
);
