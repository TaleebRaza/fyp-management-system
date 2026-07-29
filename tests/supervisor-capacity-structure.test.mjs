import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('capacity reservation is a conditional counter update with a non-negative release', async () => {
  const source = await readFile(
    new URL('../lib/supervisorCapacity.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /User\.updateOne\(/);
  assert.match(source, /\$expr:/);
  assert.match(source, /\$lt:/);
  assert.match(source, /\$inc: \{ occupiedSlots: 1 \}/);
  assert.match(source, /\$gt: \['\$occupiedSlots', 0\]/);
  assert.match(source, /\$inc: \{ occupiedSlots: -1 \}/);
  assert.doesNotMatch(source, /countDocuments/);
});
