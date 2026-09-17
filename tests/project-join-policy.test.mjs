import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('team joins allow students from different batches', async () => {
  const joinRoute = await readFile(
    new URL('../app/api/project/join/route.ts', import.meta.url),
    'utf8'
  );

  assert.match(joinRoute, /firstMember\.program !== student\.program/);
  assert.doesNotMatch(joinRoute, /firstMember\.batch !== student\.batch/);
});
