import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const storage = await readFile(
  new URL('../lib/security/storage.ts', import.meta.url),
  'utf8'
);

test('broadcast access uses the canonical project membership relationship', () => {
  assert.match(
    storage,
    /Project\.exists\(\{ supervisorId, members: studentId \}\)/
  );
  assert.equal(
    storage.match(/hasSupervisedProject\(currentUser\.id, broadcastOwner\._id\.toString\(\)\)/g)?.length,
    2
  );
  assert.doesNotMatch(storage, /User\.exists\(/);
});
