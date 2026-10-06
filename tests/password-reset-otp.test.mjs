import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import bcrypt from 'bcryptjs';
import ts from 'typescript';
import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const originalSecret = process.env.PASSWORD_RESET_SECRET;
process.env.PASSWORD_RESET_SECRET = 'test-only-password-reset-secret-at-least-32-bytes';
after(() => {
  if (originalSecret === undefined) delete process.env.PASSWORD_RESET_SECRET;
  else process.env.PASSWORD_RESET_SECRET = originalSecret;
});
const credentials = await importTypeScriptModuleWithDependencies('lib/auth/passwordResetCredentials.ts');
const validation = await importTypeScriptModuleWithDependencies('lib/auth/passwordResetValidation.ts');
const password = await importTypeScriptModuleWithDependencies('lib/security/password.ts');
const source = await readFile(new URL('../lib/auth/passwordResetService.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const email = 'person@student.uoh.edu.pk';
const input = (otp) => ({ email, otp });
const completion = (resetToken, account = email) => ({ email: account, resetToken, newPassword: 'a-new-password-123' });
const rateSource = await readFile(new URL('../lib/rateLimit.ts', import.meta.url), 'utf8');
const rateCompiled = ts.transpileModule(rateSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;

// Evaluate the Mongo operators used by the actual service queries, rather than
// reproducing the reset policy. This exercises its atomic guards and pipeline.
function matches(record, filter, now) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') return condition.every((part) => matches(record, part, now));
    if (key === '$expr') return expression(condition, record, now);
    if (key === '$or') return condition.some((part) => matches(record, part, now));
    const value = record[key];
    if (condition === null) return value == null;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      return Object.entries(condition).every(([operator, expected]) => {
        if (operator === '$in') return expected.includes(value);
        if (operator === '$lt') return value != null && value < expected;
        if (operator === '$lte') return value != null && value <= expected;
        if (operator === '$gt') return value != null && value > expected;
        if (operator === '$regex') return typeof value === 'string' && new RegExp(expected).test(value);
        throw new Error(`Unsupported filter operator: ${operator}`);
      });
    }
    return value === condition;
  });
}

function expression(value, record, now) {
  if (value === '$$NOW') return new Date(now);
  if (typeof value === 'string' && value.startsWith('$')) return record[value.slice(1)];
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const [operator, args] = Object.entries(value)[0];
  if (operator === '$ifNull') return expression(args[0], record, now) ?? expression(args[1], record, now);
  if (operator === '$lte') return expression(args[0], record, now) <= expression(args[1], record, now);
  if (operator === '$gt') return expression(args[0], record, now) > expression(args[1], record, now);
  if (operator === '$add') return args.reduce((sum, arg) => sum + expression(arg, record, now), 0);
  if (operator === '$cond') return expression(args[expression(args[0], record, now) ? 1 : 2], record, now);
  throw new Error(`Unsupported pipeline operator: ${operator}`);
}

function setup(overrides = {}) {
  let now = Date.UTC(2026, 9, 6), sequence = 123455;
  const user = { _id: 'user-1', email, role: 'student', isActive: true, name: 'Student', rollNo: 'F23-0201', sessionVersion: 0, ...overrides };
  const state = { users: [user], sent: [], delivered: true, configured: true, rateAllowed: true, logs: [], activities: [], minimumWaits: [], monotonic: 0, rates: new Map() };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const model = {
    findOne: (filter) => ({ select: async () => {
      const record = state.users.find((item) => matches(item, filter, now));
      return record ? structuredClone(record) : null;
    } }),
    findOneAndUpdate: (filter, update, options) => ({ select: async () => {
      const record = state.users.find((item) => matches(item, filter, now));
      if (!record) return null;
      const before = structuredClone(record);
      if (Array.isArray(update)) {
        Object.assign(record, Object.fromEntries(Object.entries(update[0].$set).map(([key, value]) => [key, expression(value, before, now)])));
      } else {
        for (const [key, count] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + count;
      }
      return options.returnDocument === 'before' ? before : structuredClone(record);
    } }),
    updateOne: async (filter, update) => {
      const record = state.users.find((item) => matches(item, filter, now));
      if (!record) return { modifiedCount: 0 };
      Object.assign(record, update.$set);
      for (const [key, count] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + count;
      return { modifiedCount: 1 };
    },
  };
  const rateExports = {};
  vm.runInNewContext(rateCompiled, {
    exports: rateExports, Date: ClockDate, process: { env: { NODE_ENV: 'production' } },
    require: (name) => name === 'node:crypto' ? crypto : {
      findOneAndUpdate: async ({ identifier }) => {
        let record = state.rates.get(identifier);
        if (!record || now - record.createdAt.getTime() >= 900_000) record = { count: 0, createdAt: new Date(now) };
        record.count++;
        state.rates.set(identifier, record);
        return record;
      },
    },
  });
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Date: ClockDate,
    console: { error: (...args) => state.logs.push(args) },
    require: (name) => {
      const modules = {
        'node:crypto': { ...crypto, randomInt: () => ++sequence },
        'node:perf_hooks': { performance: { now: () => state.monotonic } },
        'node:timers/promises': { setTimeout: async (ms) => { state.minimumWaits.push(ms); state.monotonic += ms; } },
        './passwordResetCredentials': credentials,
        '../mongodb': async () => {}, '../../models/User': model,
        '../rateLimit': { consumeRateLimitDimensions: async (...args) => state.rateAllowed
          ? rateExports.consumeRateLimitDimensions(...args) : { allowed: false } },
        '../security/password': { ...password, hashPassword: async (...args) => {
          if (state.beforeHash) await state.beforeHash();
          return password.hashPassword(...args);
        } },
        '../portalActivityLog': {
          isPortalActivityActorRole: () => true,
          recordPortalActivity: async (entry) => {
            if (state.activityError) throw new Error('private OTP and token data');
            state.activities.push(entry);
          },
        },
        '../mailer': {
          isEmailConfigured: () => state.configured,
          sendNotificationEmail: async (...args) => {
            state.sent.push(args);
            if (state.beforeSend) await state.beforeSend();
            if (state.deliveryError) throw new Error('private OTP and token data');
            return state.delivered;
          },
        },
        './passwordResetValidation': validation,
      };
      assert.ok(name in modules, name);
      return modules[name];
    },
  });
  return {
    ...exports, state, user,
    advance: (ms) => { now += ms; },
    code: () => state.sent.at(-1)[3].match(/code is (\d{6})/)[1],
  };
}
const headers = new Headers();


test('validation rejects malformed codes, old payloads, and passwords submitted with only an OTP', () => {
  assert.equal(validation.parsePasswordResetRequestInput({ email: ' PERSON@STUDENT.UOH.EDU.PK ' }).value.email, email);
  for (const value of ['bad', 'x@student.uoh.edu.pk\r\nBcc: stolen@example.com', { $ne: '' }]) {
    assert.equal(validation.parsePasswordResetRequestInput({ email: value }).ok, false);
  }
  for (const address of ['x@student.uoh.edu.pk.evil.com', 'x@evilstudent.uoh.edu.pk', 'x@uoh.edu.pk']) {
    assert.equal(validation.passwordResetAccountFilter(address).role.$in.includes('student'), false);
  }
  for (const otp of ['12345', '1234567', 'abcdef']) assert.equal(validation.parsePasswordResetOtpInput(input(otp)).ok, false);
  assert.equal(validation.parsePasswordResetCompletionInput({ ...input('123456'), newPassword: 'long-password' }).ok, false);
  assert.equal(validation.parsePasswordResetCompletionInput({ rollNo: 'F23-0201', resetToken: 'a'.repeat(64), newPassword: 'long-password' }).ok, false);
  assert.equal(validation.parsePasswordResetCompletionInput(completion('a'.repeat(64))).ok, true);
});

test('OTP generation is cryptographic and storage uses account-bound keyed hashes and constant-time comparison', async () => {
  assert.doesNotMatch(source, /Math\.random/);
  assert.match(source, /randomInt\(0, 1_000_000\)/);
  const flow = setup();
  const response = await flow.requestPasswordReset({ email }, headers);
  const code = flow.code();
  assert.ok(flow.user.resetCode.startsWith('otp:v2:'));
  assert.equal(flow.user.resetCode.includes(code), false);
  assert.equal(credentials.verifyResetOtp(email, code, flow.user.resetCode), true);
  assert.equal(credentials.verifyResetOtp('other@student.uoh.edu.pk', code, flow.user.resetCode), false);
  assert.equal(credentials.verifyResetOtp(email, '000000', flow.user.resetCode), false);
  assert.equal(credentials.verifyResetOtp(email, code, 'malformed'), false);
  assert.notEqual(credentials.hashResetOtp(email, code), flow.user.resetCode);
  assert.equal(flow.user.resetCodeExpiry.getTime() - flow.user.resetEmailSentAt.getTime(), 600_000);
  assert.equal(JSON.stringify(response).includes(code), false);
});

test('existing, nonexistent, ineligible, cooldown, and delivery-failure accounts have identical status/body and bounded timing work', async () => {
  const flow = setup();
  const response = await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 1);
  assert.deepEqual(flow.state.minimumWaits, [750]);
  const blocked = await flow.requestPasswordReset({ email }, headers);
  assert.equal(JSON.stringify(blocked), JSON.stringify(response));
  for (const overrides of [{ email: 'other@student.uoh.edu.pk' }, { email: 'person@example.com' }, { isActive: false }]) {
    const missing = setup(overrides);
    const address = overrides.email === 'person@example.com' ? overrides.email : email;
    assert.equal(JSON.stringify(await missing.requestPasswordReset({ email: address }, headers)), JSON.stringify(response));
    assert.deepEqual(missing.state.minimumWaits, [750]);
    assert.equal(missing.state.sent.length, 0);
  }
  for (const throwError of [false, true]) {
    const failed = setup();
    failed.state.delivered = false;
    failed.state.deliveryError = throwError;
    assert.equal(JSON.stringify(await failed.requestPasswordReset({ email }, headers)), JSON.stringify(response));
    assert.equal(failed.user.resetCode, null);
    assert.equal(failed.user.resetCodeExpiry, null);
    assert.equal((await failed.verifyPasswordResetOtp(input(failed.code()), headers)).status, 400);
    assert.equal(JSON.stringify(failed.state.logs), '[["password_reset_delivery_failed"]]');
  }
});

test('SMTP is awaited and the pending OTP remains unusable until successful delivery', async () => {
  const flow = setup();
  let release, sending;
  const started = new Promise((resolve) => { sending = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  flow.state.beforeSend = async () => { sending(); await gate; };
  let finished = false;
  const request = flow.requestPasswordReset({ email }, headers).then((response) => { finished = true; return response; });
  await started;
  assert.equal(finished, false);
  assert.equal(flow.user.resetCodeExpiry, null);
  assert.equal((await flow.verifyPasswordResetOtp(input(flow.code()), headers)).status, 400);
  release();
  assert.equal((await request).status, 200);
  assert.equal(finished, true);
  assert.equal((await flow.verifyPasswordResetOtp(input(flow.code()), headers)).status, 200);
});

test('slow SMTP is awaited without adding more artificial delay', async () => {
  const flow = setup();
  flow.state.beforeSend = async () => { flow.state.monotonic += 1000; };
  assert.equal((await flow.requestPasswordReset({ email }, headers)).status, 200);
  assert.equal(flow.state.minimumWaits.length, 0);
});

test('security-critical delivery has no detached task or response-first scheduler', async () => {
  const route = await readFile(new URL('../app/api/auth/forgot-password/route.ts', import.meta.url), 'utf8');
  const serviceAst = ts.createSourceFile('service.ts', source, ts.ScriptTarget.Latest, true);
  const parents = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
        && ['dispatchPasswordReset', 'sendNotificationEmail'].includes(node.expression.text)) {
      parents.push(node.parent.kind);
    }
    ts.forEachChild(node, visit);
  }
  visit(serviceAst);
  assert.equal(parents.length, 2);
  assert.ok(parents.every((kind) => kind === ts.SyntaxKind.AwaitExpression));
  assert.doesNotMatch(source + route, /scheduleDelivery|\bafter\s*\(|\bvoid\s+(?:dispatchPasswordReset|sendNotificationEmail)/);
});

test('recipient comes from the matched database account; client recipient overrides are ignored', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email, to: 'attacker@example.com', recipient: 'attacker@example.com' }, headers);
  assert.equal(flow.state.sent[0][0], flow.user.email);
  const missing = setup();
  await missing.requestPasswordReset({ email: 'attacker@example.com', to: email }, headers);
  assert.equal(missing.state.sent.length, 0);
});

test('send cooldown, three-email cap, and 24 hours after the third email are enforced', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  flow.advance(119_999);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 1);
  flow.advance(1);
  await flow.requestPasswordReset({ email }, headers);
  flow.advance(120_000);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 3);
  flow.advance(86_399_999);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 3);
  flow.advance(1);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 4);
  assert.equal(flow.user.resetEmailCount, 1);
});

test('parallel requests claim one send, and five concurrent wrong-code attempts exhaust the code', async () => {
  const flow = setup();
  await Promise.all(Array.from({ length: 8 }, () => flow.requestPasswordReset({ email }, headers)));
  assert.equal(flow.state.sent.length, 1);
  await Promise.all(Array.from({ length: 8 }, () => flow.verifyPasswordResetOtp(input('000000'), headers)));
  assert.equal(flow.user.resetAttempts, 5);
  assert.equal((await flow.verifyPasswordResetOtp(input(flow.code()), headers)).status, 400);
});

test('wrong OTP and expired OTP are rejected; resend invalidates the old OTP', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const oldCode = flow.code();
  assert.equal((await flow.verifyPasswordResetOtp(input('000000'), headers)).status, 400);
  flow.advance(120_000);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.user.resetAttempts, 0);
  assert.equal((await flow.verifyPasswordResetOtp(input(oldCode), headers)).status, 400);
  flow.advance(600_000);
  assert.equal((await flow.verifyPasswordResetOtp(input(flow.code()), headers)).status, 400);
});

test('successful verification consumes OTP and issues a hashed five-minute high-entropy grant', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const code = flow.code();
  const response = await flow.verifyPasswordResetOtp(input(code), headers);
  assert.equal(response.status, 200);
  const token = response.body.resetToken;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(flow.user.resetCode, credentials.hashResetGrant(email, token));
  assert.equal(flow.user.resetCode.includes(token), false);
  assert.equal(flow.user.resetCodeExpiry.getTime() - flow.user.resetEmailSentAt.getTime(), 300_000);
  assert.equal((await flow.verifyPasswordResetOtp(input(code), headers)).status, 400);
  assert.equal(flow.user.password, undefined);
  assert.equal((await flow.completePasswordReset({ ...input(code), newPassword: 'a-new-password' }, headers)).status, 400);
});

test('password change hashes the password, consumes the grant once, and increments sessionVersion', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const verified = await flow.verifyPasswordResetOtp(input(flow.code()), headers);
  const token = verified.body.resetToken;
  assert.equal((await flow.completePasswordReset(completion(token), headers)).status, 200);
  assert.equal((await password.verifyPassword('a-new-password-123', flow.user.password)).matches, true);
  assert.equal(flow.user.resetCode, null);
  assert.equal(flow.user.resetCodeExpiry, null);
  assert.equal(flow.user.sessionVersion, 1);
  assert.equal(flow.user.resetEmailCount, 1);
  assert.equal(flow.state.activities[0].action, 'password-changed');
  assert.equal((await flow.completePasswordReset(completion(token), headers)).status, 400);
});

test('expired grants, wrong-account grants, and grants invalidated by resends cannot change passwords', async () => {
  for (const scenario of ['expiry', 'other-account', 'resend']) {
    const flow = setup();
    await flow.requestPasswordReset({ email }, headers);
    const verified = await flow.verifyPasswordResetOtp(input(flow.code()), headers);
    if (scenario === 'expiry') flow.advance(300_000);
    if (scenario === 'resend') { flow.advance(120_000); await flow.requestPasswordReset({ email }, headers); }
    const payload = completion(verified.body.resetToken, scenario === 'other-account' ? 'other@student.uoh.edu.pk' : email);
    assert.equal((await flow.completePasswordReset(payload, headers)).status, 400);
    assert.equal(flow.user.password, undefined);
  }
});

test('grant expiry is checked at the atomic write even if it expires during password hashing', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const verified = await flow.verifyPasswordResetOtp(input(flow.code()), headers);
  flow.state.beforeHash = () => flow.advance(300_000);
  assert.equal((await flow.completePasswordReset(completion(verified.body.resetToken), headers)).status, 400);
  assert.equal(flow.user.password, undefined);
});

test('concurrent verification issues only one grant and concurrent password changes consume it once', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const responses = await Promise.all(Array.from({ length: 8 }, () => flow.verifyPasswordResetOtp(input(flow.code()), headers)));
  const successes = responses.filter((response) => response.status === 200);
  assert.equal(successes.length, 1);
  const changed = await Promise.all(Array.from({ length: 5 }, () => flow.completePasswordReset(completion(successes[0].body.resetToken), headers)));
  assert.equal(changed.filter((response) => response.status === 200).length, 1);
  assert.equal(flow.user.sessionVersion, 1);
});

test('SMTP failure refunds counters without resurrecting previous OTPs or grants', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const oldCode = flow.code();
  flow.advance(120_000);
  flow.state.delivered = false;
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.user.resetEmailCount, 1);
  assert.equal(flow.user.resetCode, null);
  assert.equal((await flow.verifyPasswordResetOtp(input(oldCode), headers)).status, 400);
  flow.state.delivered = true;
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.user.resetEmailCount, 2);
});

test('supervisors and admins require mailbox possession; supervisor ID alone grants nothing', async () => {
  for (const role of ['supervisor', 'admin']) {
    const flow = setup({ role, email: 'staff@example.com' });
    assert.equal((await flow.requestPasswordReset({ rollNo: 'private-id' }, headers)).status, 400);
    await flow.requestPasswordReset({ email: flow.user.email }, headers);
    const verified = await flow.verifyPasswordResetOtp({ email: flow.user.email, otp: flow.code() }, headers);
    assert.equal(verified.status, 200);
    assert.equal((await flow.completePasswordReset(completion(verified.body.resetToken, flow.user.email), headers)).status, 200);
    assert.equal(flow.user.sessionVersion, 1);
  }
});

test('real rate limiter enforces per-email and per-IP budgets and hashes identifiers', async () => {
  const flow = setup();
  const requestHeaders = new Headers({ 'x-vercel-forwarded-for': '203.0.113.1' });
  for (let i = 0; i < 20; i++) assert.equal((await flow.requestPasswordReset({ email: `missing${i}@student.uoh.edu.pk` }, requestHeaders)).status, 200);
  assert.equal((await flow.requestPasswordReset({ email: 'another@student.uoh.edu.pk' }, requestHeaders)).status, 429);
  const other = setup();
  for (let i = 0; i < 20; i++) await other.requestPasswordReset({ email }, headers);
  assert.equal((await other.requestPasswordReset({ email }, headers)).status, 429);
  for (const key of flow.state.rates.keys()) assert.equal(key.includes('@'), false);
  const verify = setup();
  for (let i = 0; i < 30; i++) await verify.verifyPasswordResetOtp({ email: `missing${i}@student.uoh.edu.pk`, otp: '000000' }, requestHeaders);
  assert.equal((await verify.verifyPasswordResetOtp(input('000000'), requestHeaders)).status, 429);
});

test('missing/weak secrets fail closed and changing the server key invalidates stored OTPs', async () => {
  const saved = process.env.PASSWORD_RESET_SECRET;
  const nextAuth = process.env.NEXTAUTH_SECRET;
  try {
    process.env.PASSWORD_RESET_SECRET = 'too-short';
    assert.equal(credentials.passwordResetSecret(), null);
    const flow = setup();
    assert.equal((await flow.requestPasswordReset({ email }, headers)).status, 503);
    assert.equal((await flow.verifyPasswordResetOtp(input('000000'), headers)).status, 503);
    assert.equal((await flow.completePasswordReset(completion('a'.repeat(64)), headers)).status, 503);
    process.env.PASSWORD_RESET_SECRET = saved;
    const stored = credentials.hashResetOtp(email, '123456');
    process.env.PASSWORD_RESET_SECRET = 'a-different-strong-server-secret-at-least-32-bytes';
    assert.equal(credentials.verifyResetOtp(email, '123456', stored), false);
    delete process.env.PASSWORD_RESET_SECRET;
    process.env.NEXTAUTH_SECRET = saved;
    assert.equal(credentials.passwordResetSecret(), saved);
  } finally {
    process.env.PASSWORD_RESET_SECRET = saved;
    if (nextAuth === undefined) delete process.env.NEXTAUTH_SECRET;
    else process.env.NEXTAUTH_SECRET = nextAuth;
  }
});

test('legacy OTP hashes are rejected; recovery error logs contain no codes, grants, emails, or secrets', async () => {
  const flow = setup({ resetCode: 'otp:v1:' + await bcrypt.hash('123456', 10), resetCodeExpiry: new Date(Date.now() + 60_000), resetAttempts: 0 });
  assert.equal((await flow.verifyPasswordResetOtp(input('123456'), headers)).status, 400);
  flow.state.deliveryError = true;
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(JSON.stringify(flow.state.logs), '[["password_reset_delivery_failed"]]');
  flow.state.deliveryError = false;
  flow.advance(120_000);
  await flow.requestPasswordReset({ email }, headers);
  const code = flow.code();
  const verified = await flow.verifyPasswordResetOtp(input(code), headers);
  flow.state.activityError = true;
  assert.equal((await flow.completePasswordReset(completion(verified.body.resetToken), headers)).status, 200);
  const logs = JSON.stringify(flow.state.logs);
  for (const value of [email, code, verified.body.resetToken, process.env.PASSWORD_RESET_SECRET, 'private OTP and token data']) {
    assert.equal(logs.includes(value), false);
  }
});

test('verification and completion also enforce per-account budgets', async () => {
  const flow = setup();
  for (let i = 0; i < 30; i++) assert.equal((await flow.verifyPasswordResetOtp(input('000000'), headers)).status, 400);
  assert.equal((await flow.verifyPasswordResetOtp(input('000000'), headers)).status, 429);
  for (let i = 0; i < 30; i++) assert.equal((await flow.completePasswordReset(completion('a'.repeat(64)), headers)).status, 400);
  assert.equal((await flow.completePasswordReset(completion('a'.repeat(64)), headers)).status, 429);
});

test('routes bound JSON bodies, keep grants out of caches, and log only event names on exceptions', async () => {
  const requestHelpers = await importTypeScriptModuleWithDependencies('lib/security/request.ts');
  for (const [path, functionName] of [
    ['forgot-password', 'requestPasswordReset'],
    ['verify-reset-otp', 'verifyPasswordResetOtp'],
    ['reset-password', 'completePasswordReset'],
  ]) {
    const routeSource = await readFile(new URL(`../app/api/auth/${path}/route.ts`, import.meta.url), 'utf8');
    const routeCode = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {}, logs = [];
    let fail = false, calls = 0;
    vm.runInNewContext(routeCode, {
      exports, console: { error: (...args) => logs.push(args) },
      require: (name) => {
        if (name === 'next/server') return { NextResponse: Response };
        if (name.endsWith('/request')) return requestHelpers;
        if (name.endsWith('/passwordResetService')) return {
          [functionName]: async () => {
            calls++;
            if (fail) throw new Error('OTP-123456 grant-secret student@example.com SMTP-secret');
            return { status: 200, body: path === 'verify-reset-otp' ? { resetToken: 'a'.repeat(64) } : { message: 'Generic recovery response' } };
          },
        };
        throw new Error('Unexpected route import');
      },
    });
    const req = (body, extraHeaders = {}) => new Request(`https://example.com/api/auth/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...extraHeaders }, body,
    });
    assert.equal((await exports.POST(req('{'))).status, 400);
    assert.equal((await exports.POST(req('x'.repeat(8193)))).status, 413);
    assert.equal(calls, 0);
    const response = await exports.POST(req('{}'));
    assert.equal(response.status, 200);
    if (path === 'verify-reset-otp') assert.equal(response.headers.get('cache-control'), 'no-store');
    fail = true;
    assert.equal((await exports.POST(req('{}'))).status, 500);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].length, 1);
    assert.match(logs[0][0], /^password_reset_[a-z_]+_failed$/);
  }
});
