import assert from 'node:assert/strict';
import test from 'node:test';
import bcrypt from 'bcryptjs';

import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const password = await importTypeScriptModuleWithDependencies('lib/security/password.ts');

test('scrypt verifies the complete password including Unicode beyond bcrypt limits', async () => {
  const original = `correct horse ${'🔐'.repeat(40)} tail-a`;
  const changedTail = `${original.slice(0, -1)}b`;
  const hash = await password.hashPassword(original);

  assert.equal((await password.verifyPassword(original, hash)).matches, true);
  assert.equal((await password.verifyPassword(changedTail, hash)).matches, false);
});

test('bcrypt compatibility rejects inputs that bcrypt would truncate', async () => {
  const acceptedLegacyPassword = 'legacy-password';
  const legacyHash = await bcrypt.hash(acceptedLegacyPassword, 4);
  assert.deepEqual(
    await password.verifyPassword(acceptedLegacyPassword, legacyHash),
    { matches: true, needsRehash: true }
  );

  const longPassword = `${'a'.repeat(72)}first`;
  const collision = `${'a'.repeat(72)}second`;
  const truncatedHash = await bcrypt.hash(longPassword, 4);
  assert.equal(await bcrypt.compare(collision, truncatedHash), true);
  assert.equal((await password.verifyPassword(collision, truncatedHash)).matches, false);
  assert.equal((await password.verifyPassword('plaintext', 'plaintext')).matches, false);
});
