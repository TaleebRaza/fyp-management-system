import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('admin project review search matches words anywhere in a field', async () => {
  const source = await readFile(
    new URL('../lib/projectReviewQueue.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /new RegExp\(escapeRegex\(search\), 'i'\)/);
  assert.doesNotMatch(source, /new RegExp\(`\^\$\{escapeRegex\(search\)\}`, 'i'\)/);
});
