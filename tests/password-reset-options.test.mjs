import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceUrl = new URL('../components/auth/password-reset/passwordResetOptions.ts', import.meta.url);

function expectedBatchOptions(currentYear) {
  const firstYear = 2021;
  const finalYear = Math.max(currentYear + 1, firstYear);
  return Array.from({ length: (finalYear - firstYear + 1) * 2 }, (_, index) => {
    const semester = index % 2 === 0 ? 'Spring' : 'Fall';
    return `${semester} ${firstYear + Math.floor(index / 2)}`;
  });
}

test('batch option source keeps the deterministic 2021 baseline and two-semester order', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.match(source, /FIRST_PASSWORD_RESET_BATCH_YEAR = 2021/);
  assert.match(source, /index % 2 === 0 \? 'Spring' : 'Fall'/);
  assert.deepEqual(expectedBatchOptions(2021), [
    'Spring 2021',
    'Fall 2021',
    'Spring 2022',
    'Fall 2022',
  ]);
});

test('batch options include the year after the current year', () => {
  const values = expectedBatchOptions(2026);
  assert.equal(values.at(0), 'Spring 2021');
  assert.equal(values.at(-1), 'Fall 2027');
  assert.equal(values.length, 14);
});
