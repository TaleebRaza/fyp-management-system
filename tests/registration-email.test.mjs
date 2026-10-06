import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { isValidRegistrationEmailAddress } = await importTypeScriptModule('lib/security/input.ts');

test('registration accepts only the two exact university domains', () => {
  for (const email of ['name@student.uoh.edu.pk', 'name@uoh.edu.pk', ' NAME@STUDENT.UOH.EDU.PK ']) {
    assert.equal(isValidRegistrationEmailAddress(email), true, email);
  }
  for (const email of [
    'name@gmail.com', 'name@sub.uoh.edu.pk', 'name@student.uoh.edu.pk.evil.com',
    'name@evilstudent.uoh.edu.pk', '@uoh.edu.pk', 'a b@uoh.edu.pk',
    'a@b@student.uoh.edu.pk', 'Name <name@uoh.edu.pk>', '', null,
    `${'a'.repeat(255)}@uoh.edu.pk`,
  ]) {
    assert.equal(isValidRegistrationEmailAddress(email), false, String(email));
  }
});

test('registration form and API both enforce the shared domain validator', async () => {
  for (const file of ['components/auth/RegisterView.tsx', 'app/api/register/route.ts']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(source, /if\s*\(!isValidRegistrationEmailAddress\(/);
  }
});
