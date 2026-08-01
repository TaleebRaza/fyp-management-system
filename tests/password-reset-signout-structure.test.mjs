import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('a successful password reset signs out every open browser tab through NextAuth', async () => {
  const source = await readFile(
    new URL('../components/auth/password-reset/usePasswordResetFlow.ts', import.meta.url),
    'utf8'
  );

  assert.match(source, /import \{ signOut \} from 'next-auth\/react';/);
  assert.match(source, /if \(result\.ok\) \{\s*try \{\s*await signOut\(\{ redirect: false \}\);/);
  assert.match(source, /Other open tabs could not be signed out automatically/);
});
