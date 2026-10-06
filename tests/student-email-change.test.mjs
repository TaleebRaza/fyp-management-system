import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const originalSecret = process.env.PASSWORD_RESET_SECRET;
process.env.PASSWORD_RESET_SECRET = 'email-change-test-secret-at-least-32-bytes';
after(() => { if (originalSecret === undefined) delete process.env.PASSWORD_RESET_SECRET; else process.env.PASSWORD_RESET_SECRET = originalSecret; });
const credentials = await importTypeScriptModuleWithDependencies('lib/auth/passwordResetCredentials.ts');
const password = await importTypeScriptModuleWithDependencies('lib/security/password.ts');
const input = await importTypeScriptModuleWithDependencies('lib/security/input.ts');
const hash = await password.hashPassword('existing-password-123');
const source = await readFile(new URL('../lib/auth/studentEmailChange.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const address = 'new@student.uoh.edu.pk';
const body = { action: 'request', email: address, password: 'existing-password-123' };
const get = (record, path) => path.split('.').reduce((value, key) => value?.[key], record);
function set(record, path, value) {
  const keys = path.split('.'), last = keys.pop();
  let target = record;
  for (const key of keys) target = target[key] ||= {};
  target[last] = value;
}
function matches(record, query, now) {
  return Object.entries(query).every(([key, condition]) => {
    if (key === '$or') return condition.some((part) => matches(record, part, now));
    if (key === '$and') return condition.every((part) => matches(record, part, now));
    if (key === '$expr') return get(record, condition.$gt[0].slice(1)) > new Date(now);
    const value = get(record, key);
    if (condition === null) return value == null;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      if ('$lt' in condition) return value != null && value < condition.$lt;
      if ('$lte' in condition) return value != null && value <= condition.$lte;
    }
    return value === condition;
  });
}
function fixture() {
  let now = Date.UTC(2026, 9, 6);
  const user = { _id: 'student-1', role: 'student', isActive: true, email: 'old@student.uoh.edu.pk', password: hash, sessionVersion: 0, resetCode: 'old-reset-grant', resetCodeExpiry: new Date(now + 600_000) };
  const state = { sent: [], delivered: true, limited: false, duplicate: false, logs: [], snapshots: [] };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  function update(query, values) {
    state.snapshots.push(query);
    if (!matches(user, query, now)) return null;
    for (const [key, value] of Object.entries(values.$set || {})) set(user, key, value);
    for (const [key, value] of Object.entries(values.$inc || {})) set(user, key, (get(user, key) || 0) + value);
    for (const key of Object.keys(values.$unset || {})) delete user[key];
    return structuredClone(user);
  }
  const model = {
    findOne: (query) => ({ select: async () => matches(user, query, now) ? structuredClone(user) : null }),
    exists: async () => state.duplicate,
    findOneAndUpdate: (query, values) => {
      const execute = () => update(query, values);
      return { select: async () => execute(), then: (resolve, reject) => Promise.resolve().then(execute).then(resolve, reject) };
    },
    updateOne: async (query, values) => {
      if (state.finalDuplicate && values.$set?.email) throw Object.assign(new Error('duplicate'), { code: 11000 });
      return { modifiedCount: update(query, values) ? 1 : 0 };
    },
  };
  const exports = {};
  vm.runInNewContext(code, {
    exports, Date: ClockDate, console: { error: (...args) => state.logs.push(args) },
    require: (name) => {
      const modules = {
        'node:crypto': { randomInt: () => 123456 }, '../../models/User': model, '../mongodb': async () => {},
        '../rateLimit': { consumeRateLimitDimensions: async () => ({ allowed: !state.limited }) },
        '../security/input': input, '../security/password': password, './passwordResetCredentials': credentials,
        '../mailer': { isEmailConfigured: () => true, sendNotificationEmail: async (...args) => { state.sent.push(args); if (state.beforeSend) await state.beforeSend(); return state.delivered; } },
      };
      assert.ok(name in modules); return modules[name];
    },
  });
  return { user, state, advance: (ms) => { now += ms; }, run: (value) => exports.updateStudentEmail(user._id, value, new Headers()) };
}

test('email change verifies current password and exact domain before sending; duplicate/same email rejected', async () => {
  for (const values of [{ password: 'wrong-password' }, { email: 'x@example.com' }, { email: 'x@student.uoh.edu.pk.evil.com' }, { email: 'old@student.uoh.edu.pk' }]) {
    const f = fixture(); assert.equal((await f.run({ ...body, ...values })).status, 400); assert.equal(f.state.sent.length, 0);
  }
  const f = fixture(); f.state.duplicate = true; assert.equal((await f.run(body)).status, 409);
  f.user.role = 'supervisor'; assert.equal((await f.run(body)).status, 401);
});

test('new email code is hashed, scoped to account/address, awaited, and not returned to client', async () => {
  const f = fixture(); const response = await f.run(body);
  assert.equal(response.status, 200); assert.equal(f.user.email, 'old@student.uoh.edu.pk');
  assert.equal(f.state.sent[0][0], address);
  assert.ok(f.user.pendingEmailChange.code.startsWith('otp:v2:'));
  assert.equal(credentials.verifyResetOtp(`email-change:student-1:${address}`, '123456', f.user.pendingEmailChange.code), true);
  assert.equal(JSON.stringify(response).includes('123456'), false);
  assert.equal((await f.run(body)).status, 429);
});

test('confirmation changes email once, clears reset credentials, revokes sessions, and sends old-email notice', async () => {
  const f = fixture(); await f.run(body);
  const confirmation = { ...body, action: 'confirm', otp: '123456' };
  assert.equal((await f.run(confirmation)).status, 200);
  assert.equal(f.user.email, address); assert.equal(f.user.pendingEmailChange, undefined);
  assert.equal(f.user.resetCode, null); assert.equal(f.user.resetCodeExpiry, null); assert.equal(f.user.sessionVersion, 1);
  assert.equal(f.state.sent[1][0], 'old@student.uoh.edu.pk');
  assert.equal((await f.run({ ...body, email: 'another@student.uoh.edu.pk' })).status, 429);
  f.advance(86_399_999); assert.equal((await f.run({ ...body, email: 'another@student.uoh.edu.pk' })).status, 429);
  f.advance(1); assert.equal((await f.run({ ...body, email: 'another@student.uoh.edu.pk' })).status, 200);
});

test('incorrect/expired codes and five failed attempts cannot change email', async () => {
  const f = fixture(); await f.run(body);
  for (let i = 0; i < 5; i++) assert.equal((await f.run({ ...body, action: 'confirm', otp: '000000' })).status, 400);
  assert.equal((await f.run({ ...body, action: 'confirm', otp: '123456' })).status, 400);
  const expired = fixture(); await expired.run(body); expired.advance(600_000);
  assert.equal((await expired.run({ ...body, action: 'confirm', otp: '123456' })).status, 400);
});

test('failed SMTP clears pending code, keeps assigned email, and logs no sensitive data', async () => {
  const f = fixture(); f.state.delivered = false;
  assert.equal((await f.run(body)).status, 503);
  assert.equal(f.user.pendingEmailChange, undefined); assert.equal(f.user.email, 'old@student.uoh.edu.pk');
  assert.equal(JSON.stringify(f.state.logs), '[["student_email_verification_delivery_failed"]]');
  f.state.limited = true; assert.equal((await f.run(body)).status, 429);
});

test('concurrent confirmations can apply only one change; changing target requires a new code', async () => {
  const f = fixture(); await f.run(body);
  assert.equal((await f.run({ ...body, action: 'confirm', email: 'another@student.uoh.edu.pk', otp: '123456' })).status, 400);
  const responses = await Promise.all([f.run({ ...body, action: 'confirm', otp: '123456' }), f.run({ ...body, action: 'confirm', otp: '123456' })]);
  assert.equal(responses.filter((response) => response.status === 200).length, 1); assert.equal(f.user.sessionVersion, 1);
});

test('pending codes are unusable before SMTP completes, and duplicate final assignment is rejected', async () => {
  const f = fixture();
  let release, started;
  const gate = new Promise((resolve) => { release = resolve; });
  const sending = new Promise((resolve) => { started = resolve; });
  f.state.beforeSend = async () => { started(); await gate; };
  let finished = false;
  const request = f.run(body).then((response) => { finished = true; return response; });
  await sending;
  assert.equal(finished, false); assert.equal(f.user.pendingEmailChange.expiresAt, null);
  assert.equal((await f.run({ ...body, action: 'confirm', otp: '123456' })).status, 400);
  release(); await request;
  f.state.finalDuplicate = true;
  assert.equal((await f.run({ ...body, action: 'confirm', otp: '123456' })).status, 409);
  assert.equal(f.user.email, 'old@student.uoh.edu.pk');
});

test('route takes account identity from authenticated student, rejects unauthenticated and malformed requests', async () => {
  const routeSource = await readFile(new URL('../app/api/dashboard/student/email/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const helpers = await importTypeScriptModuleWithDependencies('lib/security/request.ts');
  const exports = {}, calls = [];
  let authenticated = true;
  vm.runInNewContext(compiled, {
    exports, console: { error: () => {} },
    require: (name) => {
      if (name === 'next/server') return { NextResponse: Response };
      if (name.endsWith('/security/auth')) return { requireCurrentUser: async (_req, roles) => { assert.equal(JSON.stringify(roles), '["student"]'); return authenticated ? { id: 'authenticated-student' } : null; } };
      if (name.endsWith('/security/request')) return helpers;
      if (name.endsWith('/auth/studentEmailChange')) return { updateStudentEmail: async (...args) => { calls.push(args); return { status: 200, body: { message: 'Done' } }; } };
      throw new Error('Unexpected import');
    },
  });
  const req = (value) => new Request('https://example.com/api/dashboard/student/email', { method: 'POST', headers: { 'content-type': 'application/json' }, body: value });
  assert.equal((await exports.POST(req(JSON.stringify({ ...body, id: 'other-student' })))).status, 200);
  assert.equal(calls[0][0], 'authenticated-student');
  assert.equal((await exports.POST(req('{'))).status, 400);
  authenticated = false;
  assert.equal((await exports.POST(req(JSON.stringify(body)))).status, 401);
  assert.equal(calls.length, 1);
});
