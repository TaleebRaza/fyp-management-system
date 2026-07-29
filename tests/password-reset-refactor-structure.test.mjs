import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('PasswordResetFlow is a composition component', async () => {
  const source = await read('components/auth/PasswordResetFlow.tsx');
  assert.match(source, /usePasswordResetFlow/);
  assert.match(source, /VerifyAcademicDetailsForm/);
  assert.match(source, /SetNewPasswordForm/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /useState\(/);
});

test('password reset hook owns the state machine and dialog outcomes', async () => {
  const source = await read('components/auth/password-reset/usePasswordResetFlow.ts');
  assert.match(source, /setStep\('reset'\)/);
  assert.match(source, /returnToVerification/);
  assert.match(source, /Verification failed/);
  assert.match(source, /Password reset failed/);
});

test('password reset API module preserves endpoint contracts', async () => {
  const source = await read('components/auth/password-reset/passwordResetApi.ts');
  assert.match(source, /'\/api\/supervisors'/);
  assert.match(source, /'\/api\/auth\/forgot-password'/);
  assert.match(source, /'\/api\/auth\/reset-password'/);
  assert.match(source, /'Content-Type': 'application\/json'/);
});

test('password reset routes delegate to the auth service', async () => {
  const forgot = await read('app/api/auth/forgot-password/route.ts');
  const reset = await read('app/api/auth/reset-password/route.ts');
  assert.match(forgot, /verifyPasswordResetKnowledge/);
  assert.match(reset, /completePasswordReset/);
  assert.doesNotMatch(forgot, /User\.find/);
  assert.doesNotMatch(reset, /bcrypt/);
});

test('service preserves security controls and token lifecycle', async () => {
  const source = await read('lib/auth/passwordResetService.ts');
  assert.match(source, /PASSWORD_RESET_REQUEST_LIMIT = 5/);
  assert.match(source, /PASSWORD_RESET_ATTEMPT_LIMIT = 10/);
  assert.match(source, /RESET_TOKEN_EXPIRY_MS = 15 \* 60 \* 1000/);
  assert.match(source, /randomBytes\(32\)/);
  assert.match(source, /bcrypt\.hash/);
  assert.match(source, /bcrypt\.compare/);
  assert.match(source, /resetCodeExpiry: \{ \$gt: new Date\(\) \}/);
});
