import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('login keeps throttling and writes ordered around password verification', async () => {
  const [authRoute, rateLimit, rateLimitModel, authHelper] = await Promise.all([
    readFile(new URL('../app/api/auth/[...nextauth]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/rateLimit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../models/RateLimit.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/security/auth.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(authRoute, /const LOGIN_ATTEMPT_LIMIT = 5;/);
  assert.match(authRoute, /login:account:\$\{hashRateLimitIdentifier\(normalizedRollNo\)\}/);
  assert.match(authRoute, /getLoginRateLimitStatus\([\s\S]*?LOGIN_ATTEMPT_LIMIT[\s\S]*?LOGIN_IP_ATTEMPT_LIMIT/);
  assert.match(rateLimit, /RateLimit\.find\(\{[\s\S]*?identifier: \{ \$in:/);
  assert.match(rateLimit, /\.select\('identifier count'\)\.lean/);
  assert.match(authRoute, /consumeRateLimit\([\s\S]*?LOGIN_ATTEMPT_LIMIT/);
  assert.match(authRoute, /login:ip:/);
  assert.match(authRoute, /getTrustedClientIp/);
  assert.match(authRoute, /clearRateLimit\(loginRateLimitIdentifier\)/);
  assert.match(authRoute, /await Promise\.all\(\[\s*clearRateLimit/);
  assert.match(authRoute, /\$eq: \['\$lastLoginMonth', currentMonth\]/);
  assert.match(authRoute, /\$add: \[\{ \$ifNull: \['\$monthlyLoginCount', 0\] \}, 1\]/);
  assert.match(authRoute, /\{ updatePipeline: true \}/);
  assert.match(authRoute, /select\('_id \+password role isActive name rollNo sessionVersion'\)/);
  assert.match(authRoute, /password: verifiedPasswordHash,[\s\S]*?sessionVersion: verifiedSessionVersion/);
  assert.match(authRoute, /LOGIN_PHASE_TIMINGS !== '1'/);
  assert.match(authHelper, /const \[portal, vivaAccessRestricted\] = await Promise\.all/);
  assert.match(rateLimitModel, /expires: 900/);
  assert.ok(
    authRoute.indexOf('getLoginRateLimitStatus(') < authRoute.indexOf('verifyPassword('),
    'the lockout must be checked before the password is verified',
  );
});

test('the HTTP runner binds expectations to returned requests and offers focused login measurements', async () => {
  const runner = await readFile(
    new URL('./support/viva-http-stress-runner.mjs', import.meta.url),
    'utf8'
  );

  assert.doesNotMatch(runner, /metrics\.rows\.at\(-1\)/);
  assert.match(runner, /return \{ response, status: response\.status, body, metric: row \}/);
  assert.match(runner, /metricName: 'csrf-plus-callback'/);
  assert.match(runner, /metricName: 'dashboard-readiness'/);
  assert.match(runner, /runLoginBenchmark/);
  assert.match(runner, /scenario: 'successful-login-wave'/);
  assert.match(runner, /dirtyFileHashes/);
});
