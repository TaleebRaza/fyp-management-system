import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PasswordResetFlow composes the academic verification and password forms', async () => {
  const source = await read('components/auth/PasswordResetFlow.tsx');
  assert.match(source, /usePasswordResetFlow/);
  assert.match(source, /VerifyAcademicDetailsForm/);
  assert.match(source, /SetNewPasswordForm/);
  assert.doesNotMatch(source, /RequestPasswordResetForm/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /useState\(/);
});

test('password reset hook keeps the academic recovery flow and supervisor ID path', async () => {
  const source = await read('components/auth/password-reset/usePasswordResetFlow.ts');
  assert.match(source, /setStep\('reset'\)/);
  assert.match(source, /returnToVerification/);
  assert.match(source, /supervisor ID/);
  assert.match(source, /verifyPasswordResetDetails/);
});

test('password reset API retains its endpoint and supervisor-list contracts', async () => {
  const source = await read('components/auth/password-reset/passwordResetApi.ts');
  assert.match(source, /'\/api\/supervisors'/);
  assert.match(source, /'\/api\/auth\/forgot-password'/);
  assert.match(source, /'\/api\/auth\/reset-password'/);
  assert.match(source, /'Content-Type': 'application\/json'/);
});

test('password reset routes delegate to the shared service', async () => {
  const [forgot, reset] = await Promise.all([
    read('app/api/auth/forgot-password/route.ts'),
    read('app/api/auth/reset-password/route.ts'),
  ]);

  assert.match(forgot, /verifyPasswordResetKnowledge/);
  assert.match(reset, /completePasswordReset/);
  assert.doesNotMatch(forgot, /User\.find/);
  assert.doesNotMatch(reset, /bcrypt/);
});

test('password reset service preserves student verification and permits supervisors by ID once daily', async () => {
  const source = await read('lib/auth/passwordResetService.ts');
  assert.match(source, /matchesPasswordResetKnowledge/);
  assert.match(source, /if \(user\.role === 'student'\)/);
  assert.match(source, /\['student', 'supervisor'\]/);
  assert.match(source, /PASSWORD_CHANGE_COOLDOWN_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(source, /\+resetCode \+resetCodeExpiry/);
  assert.match(source, /resetCodeExpiry: \{ \$gt: new Date\(\) \}/);
});
