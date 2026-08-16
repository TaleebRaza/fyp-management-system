import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('supervisor pending projects display No New Docs', async () => {
  const source = await readFile(
    new URL('../components/supervisor/SupervisorProjectCard.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /status === 'Pending' \? 'No New Docs' : status \|\| 'Pending'/);
});
