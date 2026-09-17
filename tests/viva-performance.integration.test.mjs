import assert from 'node:assert/strict';
import test from 'node:test';

const testDatabaseUri = process.env.VIVA_TEST_MONGODB_URI;

test(
  'keeps Viva work bounded across 50 concurrent sessions',
  { skip: testDatabaseUri ? false : 'Set VIVA_TEST_MONGODB_URI to run the MongoDB integration test.' },
  async () => {
    assert.ok(testDatabaseUri);
    const { runVivaPerformanceIntegration } = await import('./support/viva-performance-runner.mjs');
    await runVivaPerformanceIntegration(testDatabaseUri);
  }
);
