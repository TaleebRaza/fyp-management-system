import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('failed logins lock only the matching account after five attempts for the existing one-hour TTL window', async () => {
  const [authRoute, rateLimitModel] = await Promise.all([
    readFile(new URL('../app/api/auth/[...nextauth]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../models/RateLimit.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(authRoute, /const LOGIN_ATTEMPT_LIMIT = 5;/);
  assert.match(authRoute, /login:account:\$\{hashRateLimitIdentifier\(normalizedRollNo\)\}/);
  assert.match(authRoute, /consumeRateLimit\([\s\S]*?LOGIN_ATTEMPT_LIMIT/);
  assert.doesNotMatch(authRoute, /consumeRateLimitDimensions/);
  assert.match(rateLimitModel, /expires: 3600/);
});
