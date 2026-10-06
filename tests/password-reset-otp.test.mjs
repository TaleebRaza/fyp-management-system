import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import bcrypt from 'bcryptjs';
import ts from 'typescript';
import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const validation = await importTypeScriptModuleWithDependencies('lib/auth/passwordResetValidation.ts');
const password = await importTypeScriptModuleWithDependencies('lib/security/password.ts');
const source = await readFile(new URL('../lib/auth/passwordResetService.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const email = 'person@student.uoh.edu.pk';
const input = (otp) => ({ email, otp, newPassword: 'a-new-password-123' });

// Evaluate the Mongo operators used by the actual service queries, rather than
// reproducing the reset policy. This exercises its atomic guards and pipeline.
function matches(record, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$and') return condition.every((part) => matches(record, part));
    if (key === '$or') return condition.some((part) => matches(record, part));
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

function expression(value, record) {
  if (typeof value === 'string' && value.startsWith('$')) return record[value.slice(1)];
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const [operator, args] = Object.entries(value)[0];
  if (operator === '$ifNull') return expression(args[0], record) ?? expression(args[1], record);
  if (operator === '$lte') return expression(args[0], record) <= expression(args[1], record);
  if (operator === '$add') return args.reduce((sum, arg) => sum + expression(arg, record), 0);
  if (operator === '$cond') return expression(args[expression(args[0], record) ? 1 : 2], record);
  throw new Error(`Unsupported pipeline operator: ${operator}`);
}

function setup(overrides = {}) {
  let now = Date.UTC(2026, 9, 6), sequence = 123455;
  const user = { _id: 'user-1', email, role: 'student', isActive: true, name: 'Student', rollNo: 'F23-0201', sessionVersion: 0, ...overrides };
  const state = { users: [user], sent: [], delivered: true, configured: true, rateAllowed: true, logs: [], activities: [] };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const model = {
    findOneAndUpdate: (filter, update, options) => ({ select: async () => {
      const record = state.users.find((item) => matches(item, filter));
      if (!record) return null;
      const before = structuredClone(record);
      if (Array.isArray(update)) {
        Object.assign(record, Object.fromEntries(Object.entries(update[0].$set).map(([key, value]) => [key, expression(value, before)])));
      } else {
        for (const [key, count] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + count;
      }
      return options.returnDocument === 'before' ? before : structuredClone(record);
    } }),
    updateOne: async (filter, update) => {
      const record = state.users.find((item) => matches(item, filter));
      if (!record) return { modifiedCount: 0 };
      Object.assign(record, update.$set);
      for (const [key, count] of Object.entries(update.$inc || {})) record[key] = (record[key] || 0) + count;
      return { modifiedCount: 1 };
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Date: ClockDate,
    console: { error: (...args) => state.logs.push(args) },
    require: (name) => {
      const modules = {
        'node:crypto': { randomInt: () => ++sequence }, bcryptjs: bcrypt,
        '../mongodb': async () => {}, '../../models/User': model,
        '../rateLimit': { consumeRateLimitDimensions: async () => ({ allowed: state.rateAllowed }) },
        '../security/password': password,
        '../portalActivityLog': {
          isPortalActivityActorRole: () => true,
          recordPortalActivity: async (entry) => state.activities.push(entry),
        },
        '../mailer': {
          isEmailConfigured: () => state.configured,
          sendNotificationEmail: async (...args) => { state.sent.push(args); return state.delivered; },
        },
        './passwordResetValidation': validation,
      };
      assert.ok(name in modules, name);
      return modules[name];
    },
  });
  return { ...exports, state, user, advance: (ms) => { now += ms; }, code: () => state.sent.at(-1)[3].match(/code is (\d{6})/)[1] };
}
const headers = new Headers();

test('validation normalizes emails, enforces exact student domain by role, and rejects old reset payloads', () => {
  assert.equal(validation.parsePasswordResetRequestInput({ email: ' PERSON@STUDENT.UOH.EDU.PK ' }).value.email, email);
  for (const value of ['bad', 'x@student.uoh.edu.pk\r\nBcc: stolen@example.com', { $ne: '' }]) {
    assert.equal(validation.parsePasswordResetRequestInput({ email: value }).ok, false);
  }
  for (const address of ['x@student.uoh.edu.pk.evil.com', 'x@evilstudent.uoh.edu.pk', 'x@uoh.edu.pk']) {
    assert.equal(validation.passwordResetAccountFilter(address).role.$in.includes('student'), false);
  }
  assert.equal(validation.parsePasswordResetCompletionInput({ rollNo: 'F23-0201', resetToken: 'a'.repeat(64), newPassword: 'long-password' }).ok, false);
  for (const otp of ['12345', '1234567', 'abcdef']) assert.equal(validation.parsePasswordResetCompletionInput(input(otp)).ok, false);
});

test('requests deliver a hashed, expiring OTP without exposing it in API responses', async () => {
  const flow = setup();
  const response = await flow.requestPasswordReset({ email }, headers);
  assert.equal(response.status, 200);
  assert.equal(flow.state.sent.length, 1);
  assert.ok(flow.user.resetCode.startsWith('otp:v1:'));
  assert.equal(await bcrypt.compare(flow.code(), flow.user.resetCode.slice(7)), true);
  assert.equal(flow.user.resetCodeExpiry.getTime() - flow.user.resetEmailSentAt.getTime(), 600_000);
  assert.equal(JSON.stringify(response).includes(flow.code()), false);
  assert.equal(flow.state.sent[0][0], email);
});

test('two-minute spacing, three-email cap, and 24 hours after the third email are enforced', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  await flow.requestPasswordReset({ email }, headers);
  flow.advance(119_999);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 1);
  flow.advance(1);
  await flow.requestPasswordReset({ email }, headers);
  flow.advance(120_000);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 3);
  assert.equal(flow.user.resetEmailCount, 3);
  flow.advance(86_399_999);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 3);
  flow.advance(1);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.state.sent.length, 4);
  assert.equal(flow.user.resetEmailCount, 1);
});

test('parallel requests claim only one send and work with legacy users lacking new fields', async () => {
  const flow = setup();
  await Promise.all(Array.from({ length: 8 }, () => flow.requestPasswordReset({ email }, headers)));
  assert.equal(flow.state.sent.length, 1);
  assert.equal(flow.user.resetEmailCount, 1);
});

test('missing/ineligible/inactive accounts and cooldowns have the same request response', async () => {
  const eligible = setup();
  const response = await eligible.requestPasswordReset({ email }, headers);
  const blocked = await eligible.requestPasswordReset({ email }, headers);
  assert.equal(JSON.stringify(blocked), JSON.stringify(response));
  for (const overrides of [{ email: 'other@student.uoh.edu.pk' }, { email: 'person@example.com' }, { isActive: false }]) {
    const flow = setup(overrides);
    assert.equal(JSON.stringify(await flow.requestPasswordReset({ email: flow.user.email === 'person@example.com' ? flow.user.email : email }, headers)), JSON.stringify(response));
    assert.equal(flow.state.sent.length, 0);
  }
  for (const role of ['supervisor', 'admin']) {
    const flow = setup({ role, email: 'staff@example.com' });
    await flow.requestPasswordReset({ email: 'staff@example.com' }, headers);
    assert.equal(flow.state.sent.length, 1);
    assert.equal((await flow.completePasswordReset({ ...input(flow.code()), email: 'staff@example.com' }, headers)).status, 200);
  }
});

test('SMTP failure refunds the slot and restores the previous reset state', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const previous = structuredClone(flow.user);
  flow.advance(120_000);
  flow.state.delivered = false;
  await flow.requestPasswordReset({ email }, headers);
  assert.deepEqual(flow.user, previous);
  flow.state.delivered = true;
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.user.resetEmailCount, 2);
  flow.state.configured = false;
  assert.equal((await flow.requestPasswordReset({ email }, headers)).status, 503);
});

test('successful reset consumes the code, hashes the password, invalidates sessions, and retains send limits', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const code = flow.code();
  const response = await flow.completePasswordReset(input(code), headers);
  assert.equal(response.status, 200);
  assert.equal((await password.verifyPassword('a-new-password-123', flow.user.password)).matches, true);
  assert.equal(flow.user.resetCode, null);
  assert.equal(flow.user.sessionVersion, 1);
  assert.equal(flow.user.resetEmailCount, 1);
  assert.equal(flow.state.activities[0].action, 'password-changed');
  assert.equal((await flow.completePasswordReset(input(code), headers)).status, 400);
});

test('resends invalidate old codes, expiry is enforced, and five wrong attempts exhaust a code', async () => {
  const flow = setup();
  await flow.requestPasswordReset({ email }, headers);
  const oldCode = flow.code();
  flow.advance(120_000);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal((await flow.completePasswordReset(input(oldCode), headers)).status, 400);
  for (let i = 0; i < 4; i++) assert.equal((await flow.completePasswordReset(input('000000'), headers)).status, 400);
  assert.equal((await flow.completePasswordReset(input(flow.code()), headers)).status, 400);
  flow.advance(120_000);
  await flow.requestPasswordReset({ email }, headers);
  assert.equal(flow.user.resetAttempts, 0);
  flow.advance(600_000);
  assert.equal((await flow.completePasswordReset(input(flow.code()), headers)).status, 400);
});

test('concurrent verification cannot exceed five attempts or consume a code twice', async () => {
  const wrong = setup();
  await wrong.requestPasswordReset({ email }, headers);
  await Promise.all(Array.from({ length: 8 }, () => wrong.completePasswordReset(input('000000'), headers)));
  assert.equal(wrong.user.resetAttempts, 5);
  const right = setup();
  await right.requestPasswordReset({ email }, headers);
  const responses = await Promise.all(Array.from({ length: 8 }, () => right.completePasswordReset(input(right.code()), headers)));
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(right.user.sessionVersion, 1);
});

test('legacy tokens are unusable and global request/verification limits fail closed', async () => {
  const flow = setup({ resetCode: await bcrypt.hash('123456', 10), resetCodeExpiry: new Date(Date.now() + 60_000), resetAttempts: 0 });
  assert.equal((await flow.completePasswordReset(input('123456'), headers)).status, 400);
  flow.state.rateAllowed = false;
  assert.equal((await flow.requestPasswordReset({ email }, headers)).status, 429);
  assert.equal((await flow.completePasswordReset(input('123456'), headers)).status, 429);
  assert.equal(flow.state.sent.length, 0);
});
