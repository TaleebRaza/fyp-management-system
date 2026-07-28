import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared dialogs render at the document root', async () => {
  const source = await readFile(
    new URL('../components/ui/SharedUI.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /return createPortal\(/);
  assert.match(source, /document\.body/);
});
