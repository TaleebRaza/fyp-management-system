import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { buildPasswordResetBatchOptions } = await importTypeScriptModule(
  'components/auth/password-reset/passwordResetOptions.ts'
);

test('batch options start at the deterministic baseline and alternate semesters', () => {
  assert.deepEqual(buildPasswordResetBatchOptions(2021), [
    'Spring 2021',
    'Fall 2021',
    'Spring 2022',
    'Fall 2022',
  ]);
});

test('batch options include the year after the current year', () => {
  const values = buildPasswordResetBatchOptions(2026);
  assert.equal(values.at(0), 'Spring 2021');
  assert.equal(values.at(-1), 'Fall 2027');
  assert.equal(values.length, 14);
});
