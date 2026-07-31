import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { buildRollNoRegex, isValidRollNo, normalizeRollNo } =
  await importTypeScriptModule('lib/rollNo.ts');

test('roll numbers are normalized before validation and storage', () => {
  assert.equal(normalizeRollNo('  f23-0201  '), 'F23-0201');
  assert.equal(normalizeRollNo('s99-9999'), 'S99-9999');
});

test('registration accepts only F/S plus numeric XXX-XXXX roll numbers', () => {
  for (const value of ['F00-0000', 'F23-0201', 'S99-9999', '  s24-1234  ']) {
    assert.equal(isValidRollNo(value), true, `${value} should be valid`);
  }

  for (const value of [
    'A23-0201',
    'F2-0201',
    'F230201',
    'F23-020',
    'F23-02010',
    'FF3-0201',
    'F2A-0201',
    'F23-02A1',
    '',
  ]) {
    assert.equal(isValidRollNo(value), false, `${value} should be invalid`);
  }
});

test('legacy lookup remains case-insensitive and ignores surrounding spaces', () => {
  const regex = buildRollNoRegex('f23-0201');
  assert.equal(regex.test('F23-0201'), true);
  assert.equal(regex.test('  f23-0201  '), true);
  assert.equal(regex.test('F23-0202'), false);
});
