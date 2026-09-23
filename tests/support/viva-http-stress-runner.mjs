import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';

const BASE_URL = process.env.VIVA_STRESS_BASE_URL || 'http://127.0.0.1:3100';
const MONGODB_URI = process.env.VIVA_STRESS_MONGODB_URI || '';
const DATABASE_NAME = 'fyp_viva_http_stress_test';
const SESSION_CEILING = 50;
const SYNTHETIC_DOMAIN = 'example.test';
const PASSWORD = 'viva-http-stress-password';
const REPORT_DIR = process.env.VIVA_STRESS_ARTIFACT_DIR || '/tmp/fyp-viva-http-stress';
const STAGES = [1, 10, 25, 50];
const TRAFFIC_DURATION_SECONDS = Number(process.env.VIVA_STRESS_TRAFFIC_SECONDS || 300);
const KEEP_DATABASE = process.env.VIVA_STRESS_KEEP_DB === '1';
const execFileAsync = promisify(execFile);

function assertLoopbackUrl(value, label) {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), `${label} must target loopback.`);
  return url;
}

function guardEnvironment(requestedSessions = SESSION_CEILING) {
  const baseUrl = assertLoopbackUrl(BASE_URL, 'VIVA_STRESS_BASE_URL');
  assert.ok(MONGODB_URI, 'VIVA_STRESS_MONGODB_URI is required.');
  const databaseUrl = assertLoopbackUrl(MONGODB_URI, 'VIVA_STRESS_MONGODB_URI');
  assert.equal(databaseUrl.pathname, `/${DATABASE_NAME}`, `MongoDB database must be ${DATABASE_NAME}.`);
  assert.ok(databaseUrl.searchParams.get('replicaSet') === 'rs0', 'MongoDB URI must use replicaSet=rs0.');
  assert.ok(Number.isInteger(requestedSessions) && requestedSessions > 0 && requestedSessions <= SESSION_CEILING, 'Session count exceeds the local stress ceiling.');
  assert.ok(!/vercel|mongodb.net|r2.cloudflarestorage|amazonaws|sendgrid/i.test(`${BASE_URL} ${MONGODB_URI}`), 'Production service names are not allowed in a stress run.');
  return { baseUrl: baseUrl.origin, databaseUrl: databaseUrl.toString() };
}

function syntheticEmail(label) {
  return `${label}@${SYNTHETIC_DOMAIN}`;
}

function id(value) {
  return String(value?._id || value);
}

function cookieLines(response) {
  if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
  const header = response.headers.get('set-cookie');
  return header ? header.split(/,(?=[^;]+=)/) : [];
}

class HttpClient {
  constructor(baseUrl, ip) {
    this.baseUrl = baseUrl;
    this.ip = ip;
    this.cookies = new Map();
  }

  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  saveCookies(response) {
    for (const line of cookieLines(response)) {
      const pair = line.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) this.cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  async request(path, options = {}) {
    const {
      expectedStatuses = null,
      metric = {},
      ...requestOptions
    } = options;
    const method = requestOptions.method || 'GET';
    const headers = new Headers(requestOptions.headers);
    headers.set('accept', 'application/json');
    if (this.ip) headers.set('x-vercel-forwarded-for', this.ip);
    if (this.cookies.size) headers.set('cookie', this.cookieHeader());
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers.set('origin', this.baseUrl);
    if (requestOptions.body && typeof requestOptions.body !== 'string') {
      headers.set('content-type', 'application/json');
      requestOptions.body = JSON.stringify(requestOptions.body);
    }

    const startedAt = performance.now();
    let response;
    try {
      response = await fetch(new URL(path, this.baseUrl), {
        ...requestOptions,
        method,
        headers,
        redirect: 'manual',
      });
    } catch (error) {
      metrics.record(path, 0, performance.now() - startedAt, {
        ...metric,
        error: error instanceof Error ? error.message : 'network error',
        expected: false,
      });
      throw error;
    }
    this.saveCookies(response);
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { text: text.slice(0, 200) }; }
    const row = metrics.record(path, response.status, performance.now() - startedAt, {
      ...metric,
      expected: expectedStatuses ? expectedStatuses.includes(response.status) : false,
    });
    return { response, status: response.status, body, metric: row };
  }

  async login(rollNo, password = PASSWORD) {
    const result = await this.loginAttempt({ rollNo, password });
    return result.authenticated;
  }

  async loginAttempt({ rollNo, password = PASSWORD, labels = {} }) {
    const startedAt = performance.now();
    const csrf = await this.request('/api/auth/csrf', {
      expectedStatuses: [200],
      metric: { ...labels, metricName: 'csrf' },
    });
    assert.equal(csrf.status, 200, 'NextAuth CSRF endpoint must be available.');
    const form = new URLSearchParams({
      csrfToken: String(csrf.body?.csrfToken || ''),
      rollNo,
      password,
      callbackUrl: this.baseUrl,
      json: 'true',
    });
    const callback = await this.request('/api/auth/callback/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      expectedStatuses: [200, 302, 303, 401],
      metric: { ...labels, metricName: 'callback' },
    });
    const authenticated = this.cookies.has('next-auth.session-token')
      || this.cookies.has('__Secure-next-auth.session-token');
    metrics.record('csrf-plus-callback', callback.status, performance.now() - startedAt, {
      ...labels,
      metricName: 'csrf-plus-callback',
      expected: true,
    });
    return { authenticated, csrf, callback };
  }
}

const metrics = {
  rows: [],
  record(action, status, durationMs, details = {}) {
    const row = { action, status, durationMs, error: null, ...details };
    this.rows.push(row);
    return row;
  },
  reset() {
    this.rows.length = 0;
  },
  summary() {
    const byAction = new Map();
    for (const row of this.rows) {
      const labels = Object.fromEntries(
        Object.entries(row).filter(([key]) => !['action', 'status', 'durationMs', 'error', 'expected', 'metricName'].includes(key))
      );
      const name = row.metricName || row.action;
      const key = JSON.stringify([name, labels]);
      const values = byAction.get(key) || { name, labels, durations: [], statuses: {}, errors: 0, unexpected: 0 };
      values.durations.push(row.durationMs);
      values.statuses[row.status] = (values.statuses[row.status] || 0) + 1;
      if (row.error) values.errors += 1;
      if (!row.expected || row.status >= 500 || row.status === 0) values.unexpected += 1;
      byAction.set(key, values);
    }
    return [...byAction.values()].map((value) => {
      const durations = value.durations.filter(Number.isFinite).sort((a, b) => a - b);
      const percentile = (fraction) => durations[Math.max(0, Math.ceil(durations.length * fraction) - 1)] || 0;
      return {
        name: value.name,
        labels: value.labels,
        requests: durations.length,
        statuses: value.statuses,
        errors: value.errors,
        unexpected: value.unexpected,
        minMs: durations[0] || 0,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
        maxMs: durations.at(-1) || 0,
      };
    });
  },
};

async function loadModels() {
  process.env.MONGODB_URI = MONGODB_URI;
  const [user, project, round, panel, session, lock, audit, systemConfig, registrationPolicy, password] = await Promise.all([
    importTypeScriptModuleWithDependencies('models/User.ts'),
    importTypeScriptModuleWithDependencies('models/Project.ts'),
    importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
    importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
    importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
    importTypeScriptModuleWithDependencies('models/VivaParticipantLock.ts'),
    importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
    importTypeScriptModuleWithDependencies('models/SystemConfig.ts'),
    importTypeScriptModuleWithDependencies('models/RegistrationPolicy.ts'),
    importTypeScriptModuleWithDependencies('lib/security/password.ts'),
  ]);
  return {
    User: user.default,
    Project: project.default,
    VivaRound: round.default,
    VivaPanel: panel.default,
    VivaSession: session.default,
    VivaParticipantLock: lock.default,
    VivaAuditEvent: audit.default,
    SystemConfig: systemConfig.default,
    RegistrationPolicy: registrationPolicy.default,
    hashPassword: password.hashPassword,
  };
}

async function seedFixture(models) {
  await mongoose.connect(MONGODB_URI, { maxPoolSize: 20, minPoolSize: 1 });
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(models).filter((value) => typeof value?.init === 'function').map((model) => model.init()));
  const password = await models.hashPassword(PASSWORD);
  const legacyPassword = await bcrypt.hash(PASSWORD, 4);
  const definitions = [
    ...Array.from({ length: 2 }, (_, index) => ({ key: `admin${index + 1}`, name: `HTTP Admin ${index + 1}`, role: 'admin' })),
    ...Array.from({ length: 100 }, (_, index) => ({ key: `panelSup${index + 1}`, name: `HTTP Panel Supervisor ${index + 1}`, role: 'supervisor' })),
    ...Array.from({ length: 20 }, (_, index) => ({ key: `otherSup${index + 1}`, name: `HTTP Other Supervisor ${index + 1}`, role: 'supervisor' })),
    ...Array.from({ length: 100 }, (_, index) => ({ key: `vivaStudent${index + 1}`, name: `HTTP Viva Student ${index + 1}`, role: 'student' })),
    ...Array.from({ length: 25 }, (_, index) => ({ key: `otherStudent${index + 1}`, name: `HTTP Other Student ${index + 1}`, role: 'student' })),
    { key: 'legacyStudent', name: 'HTTP Legacy Student', role: 'student' },
    { key: 'inactiveStudent', name: 'HTTP Inactive Student', role: 'student', isActive: false },
  ].map((user, index) => ({
    ...user,
    email: syntheticEmail(`viva-http-${user.key}`),
    rollNo: `HTTP-${String(index + 1).padStart(4, '0')}`,
    password: user.key === 'legacyStudent' ? legacyPassword : password,
    program: user.role === 'student' ? 'BSCS' : undefined,
    batch: user.role === 'student' ? 'Fall 2026' : undefined,
  }));
  const users = await models.User.create(definitions);
  const usersByKey = new Map(users.map((user, index) => [definitions[index].key, user]));
  const vivaStudents = Array.from({ length: 100 }, (_, index) => usersByKey.get(`vivaStudent${index + 1}`));
  const panelSupervisors = Array.from({ length: 100 }, (_, index) => usersByKey.get(`panelSup${index + 1}`));
  const otherStudents = Array.from({ length: 25 }, (_, index) => usersByKey.get(`otherStudent${index + 1}`));
  const otherSupervisors = Array.from({ length: 20 }, (_, index) => usersByKey.get(`otherSup${index + 1}`));
  assert.ok([...vivaStudents, ...panelSupervisors, ...otherStudents, ...otherSupervisors].every(Boolean));

  const projects = await models.Project.create(Array.from({ length: 50 }, (_, index) => ({
    supervisorId: otherSupervisors[index % otherSupervisors.length]._id,
    members: [vivaStudents[index * 2]._id, vivaStudents[index * 2 + 1]._id],
    inviteCode: `HTTPVIVA${String(index + 1).padStart(3, '0')}`,
    title: `HTTP Viva project ${index + 1}`,
    description: 'Synthetic local stress-test project.',
  })));
  const unrelatedProjects = await models.Project.create(otherStudents.map((student, index) => ({
    supervisorId: otherSupervisors[index % otherSupervisors.length]._id,
    members: [student._id],
    inviteCode: `HTTPOther${String(index + 1).padStart(3, '0')}`,
    title: `HTTP unrelated project ${index + 1}`,
  })));
  const round = await models.VivaRound.create({
    name: 'HTTP stress synthetic round',
    targetPanelSize: 2,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    projectIds: projects.map((project) => project._id),
    examinerIds: panelSupervisors.map((user) => user._id),
    confirmedAt: new Date(),
  });
  const panels = await models.VivaPanel.create(Array.from({ length: 50 }, (_, index) => ({
    roundId: round._id,
    examinerIds: [panelSupervisors[index * 2]._id, panelSupervisors[index * 2 + 1]._id],
    panelAdminId: panelSupervisors[index * 2]._id,
    locationLabel: `HTTP Lab ${index + 1}`,
  })));
  const sessions = await models.VivaSession.create(projects.map((project, index) => ({
    roundId: round._id,
    panelId: panels[index]._id,
    projectId: project._id,
    scheduledAt: new Date(Date.now() - 60_000),
    vivaEndsAt: new Date(Date.now() + 1_800_000),
    locationLabel: `HTTP Lab ${index + 1}`,
  })));
  await models.SystemConfig.updateOne(
    { configKey: 'portal' },
    { $set: { portalPaused: false, portalPauseReason: '' } },
    { upsert: true }
  );
  await models.RegistrationPolicy.updateOne(
    { policyKey: 'student-registration' },
    { $setOnInsert: { policyKey: 'student-registration', isOpen: true, projectSubmissionsOpen: true } },
    { upsert: true }
  );
  return {
    roundId: id(round),
    sessions: sessions.map((session) => id(session)),
    panelAdmins: panelSupervisors.filter((_, index) => index % 2 === 0).map((user) => ({ id: id(user), rollNo: user.rollNo })),
    panelMembers: panelSupervisors.filter((_, index) => index % 2 === 1).map((user) => ({ id: id(user), rollNo: user.rollNo })),
    vivaStudents: vivaStudents.map((user) => ({ id: id(user), rollNo: user.rollNo })),
    otherStudents: otherStudents.map((user) => ({ id: id(user), rollNo: user.rollNo })),
    otherSupervisors: otherSupervisors.map((user) => ({ id: id(user), rollNo: user.rollNo })),
    admins: [0, 1].map((index) => ({ id: id(usersByKey.get(`admin${index + 1}`)), rollNo: usersByKey.get(`admin${index + 1}`).rollNo })),
    legacyStudent: { id: id(usersByKey.get('legacyStudent')), rollNo: usersByKey.get('legacyStudent').rollNo },
    inactiveStudent: { id: id(usersByKey.get('inactiveStudent')), rollNo: usersByKey.get('inactiveStudent').rollNo },
    unrelatedProjects: unrelatedProjects.map((project) => id(project)),
  };
}

async function resetSessions(models, fixture) {
  await models.VivaParticipantLock.deleteMany({});
  await models.VivaAuditEvent.deleteMany({ roundId: fixture.roundId });
  await models.VivaSession.updateMany(
    { roundId: fixture.roundId },
    {
      $set: { startedAt: null, vivaEndsAt: null, completedAt: null, cancelledAt: null, version: 0 },
      $unset: { roundSnapshot: 1, projectSnapshot: 1, panelSnapshot: 1, result: 1 },
    }
  );
}

async function assertInvariants(models, fixture, expectedCompleted, expectedGradesPerSession = null) {
  assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId }), 50);
  assert.equal(await models.VivaPanel.countDocuments({ roundId: fixture.roundId }), 50);
  assert.equal(await models.VivaParticipantLock.countDocuments({}), 0, 'Participant locks must be released.');
  assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId, completedAt: { $type: 'date' } }), expectedCompleted);
  if (expectedCompleted === 50 && expectedGradesPerSession === null) {
    const auditCount = await models.VivaAuditEvent.countDocuments({ roundId: fixture.roundId });
    assert.equal(auditCount, 155, 'Each completed session must have start, grade, and finalize audits, plus five valid revisions.');
    assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId, 'result.grade': 'A+' }), 5);
  }
  if (expectedCompleted === 50 && expectedGradesPerSession !== null) {
    const auditCount = await models.VivaAuditEvent.countDocuments({ roundId: fixture.roundId });
    assert.equal(auditCount, 100 + (50 * expectedGradesPerSession), 'Traffic audit count must match one start, every accepted grade, and one finalization per session.');
    assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId, result: { $type: 'object' } }), 50);
  }
}

async function requestJson(client, path, options, allowedStatuses = [200]) {
  const result = await client.request(path, options);
  result.metric.expected = allowedStatuses.includes(result.status);
  assert.ok(allowedStatuses.includes(result.status), `${path} returned unexpected ${result.status}: ${JSON.stringify(result.body)}`);
  return result;
}

async function loginUsers(fixture, baseUrl, count) {
  const clients = fixture.panelAdmins.slice(0, count).map((user, index) => ({
    user,
    client: new HttpClient(baseUrl, `198.51.100.${index + 1}`),
  }));
  const loggedIn = await Promise.all(clients.map(async ({ user, client }) => ({ user, client, ok: await client.login(user.rollNo) })));
  assert.ok(loggedIn.every(({ ok }) => ok), 'Every panel administrator must authenticate.');
  const sessions = await Promise.all(loggedIn.map(async ({ client }) => {
    const result = await client.request('/api/auth/session');
    result.metric.expected = result.status === 200;
    return result;
  }));
  assert.ok(sessions.every(({ status, body }) => status === 200 && body?.user?.id && body.user.role === 'supervisor'), 'Every panel administrator must retain its authenticated supervisor session.');
  return loggedIn;
}

async function runStage(models, fixture, baseUrl, count) {
  await resetSessions(models, fixture);
  const panelClients = await loginUsers(fixture, baseUrl, count);
  assert.equal(await models.VivaParticipantLock.countDocuments({}), 0, 'A reset stage must begin without participant locks.');
  const panelRecord = await models.User.findById(panelClients[0].user.id).select('role sessionVersion').lean();
  assert.equal(panelRecord?.role, 'supervisor', 'The panel administrator fixture must be a supervisor.');
  const panelAccess = await requestJson(panelClients[0].client, '/api/dashboard/viva-access');
  assert.equal(panelAccess.body.restricted, false, 'A panel administrator must not be restricted before its start wave.');
  const studentClient = new HttpClient(baseUrl, '198.51.100.201');
  assert.equal(await studentClient.login(fixture.vivaStudents[0].rollNo), true, 'Pre-authenticated Viva student must log in before the start wave.');
  assert.equal(await models.VivaParticipantLock.countDocuments({}), 0, 'Login must not create participant locks.');
  const panelAccessAfterStudentLogin = await requestJson(panelClients[0].client, '/api/dashboard/viva-access');
  assert.equal(panelAccessAfterStudentLogin.body.restricted, false, 'Another user login must not restrict a panel administrator.');
  const starts = await Promise.all(panelClients.map(({ user, client }, index) => requestJson(client, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'start', sessionId: fixture.sessions[index] },
  }).then((result) => ({ user, client, session: result.body.session }))));
  assert.equal(starts.filter(({ session }) => session?.phase === 'running').length, count);
  const duplicate = await requestJson(starts[0].client, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'start', sessionId: fixture.sessions[0] },
  });
  assert.equal(duplicate.body.started, false, 'A duplicate start must be idempotent.');

  const access = await requestJson(studentClient, '/api/dashboard/viva-access');
  assert.equal(access.body.restricted, true);
  const freshStudent = new HttpClient(baseUrl, '198.51.100.202');
  assert.equal(await freshStudent.login(fixture.vivaStudents[0].rollNo), false, 'A fresh Viva student login must be rejected while its session is active.');
  const freshPanelMember = new HttpClient(baseUrl, '198.51.100.203');
  assert.equal(await freshPanelMember.login(fixture.panelMembers[0].rollNo), false, 'A fresh non-admin panel-member login must be rejected while its session is active.');
  await requestJson(studentClient, '/api/dashboard/student', {
    method: 'POST',
    body: { action: 'updateName', name: 'Must remain unchanged' },
  }, [401]);

  const unrelated = new HttpClient(baseUrl, '198.51.100.230');
  assert.equal(await unrelated.login(fixture.otherStudents[0].rollNo), true, 'Unrelated student must authenticate.');
  await requestJson(unrelated, '/api/dashboard/student');
  const admin = new HttpClient(baseUrl, '198.51.100.240');
  assert.equal(await admin.login(fixture.admins[0].rollNo), true, 'Administrator must authenticate.');
  await requestJson(admin, '/api/admin/viva');

  const grades = await Promise.all(starts.map(({ client, session }, index) => requestJson(client, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'save-grade', sessionId: session.id, version: session.version, grade: 'A' },
  }).then((result) => ({ client, session: result.body.session, index }))));
  assert.equal(grades.length, count);
  if (count > 1) {
    await Promise.all(grades.slice(0, Math.min(5, count)).map(({ client, session }) => requestJson(client, '/api/dashboard/supervisor/viva', {
      method: 'POST',
      body: { action: 'save-grade', sessionId: session.id, version: session.version - 1, grade: 'F' },
    }, [409])));
  }
  const finalGrades = await Promise.all(grades.map(({ client, session, index }) => index < Math.min(5, count)
    ? requestJson(client, '/api/dashboard/supervisor/viva', {
      method: 'POST',
      body: { action: 'save-grade', sessionId: session.id, version: session.version, grade: 'A+' },
    }).then((result) => ({ client, session: result.body.session }))
    : { client, session }));
  const completions = await Promise.all(finalGrades.map(({ client, session }) => requestJson(client, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'complete', sessionId: session.id, version: session.version },
  })));
  assert.equal(completions.length, count);
  await requestJson(starts[0].client, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'complete', sessionId: fixture.sessions[0], version: 2 },
  }, [400]);
  await assertInvariants(models, fixture, count);
  return { count };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function loginMany(baseUrl, users, ipPrefix) {
  const clients = users.map((user, index) => ({
    user,
    client: new HttpClient(baseUrl, `${ipPrefix}.${index + 1}`),
  }));
  const results = await Promise.all(clients.map(async ({ user, client }) => ({
    user,
    client,
    ok: await client.login(user.rollNo),
  })));
  assert.ok(results.every(({ ok }) => ok), `Synthetic ${ipPrefix} users must authenticate.`);
  return results;
}

function callbackError(result, baseUrl) {
  const target = typeof result.body?.url === 'string'
    ? result.body.url
    : result.response.headers.get('location');
  return target ? new URL(target, baseUrl).searchParams.get('error') : null;
}

function dashboardPath(role) {
  if (role === 'admin') return '/api/admin/viva';
  if (role === 'supervisor') return '/api/dashboard/supervisor';
  return '/api/dashboard/student';
}

async function runLoginScenario({
  baseUrl,
  user,
  rollNo,
  ip,
  password = PASSWORD,
  scenario,
  concurrency,
  warmState,
  hashFormat,
  expectedOutcome,
  expectedError = null,
}) {
  const labels = {
    scenario,
    role: user?.role || 'none',
    concurrency,
    warmState,
    hashFormat,
    expectedOutcome,
  };
  const client = new HttpClient(baseUrl, ip);
  const login = await client.loginAttempt({ rollNo: rollNo || user?.rollNo || 'HTTP-MISSING', password, labels });
  const session = await client.request('/api/auth/session', {
    expectedStatuses: [200],
    metric: { ...labels, metricName: 'session' },
  });
  assert.equal(session.status, 200, `${scenario} session lookup must succeed.`);

  if (expectedOutcome === 'authenticated') {
    assert.equal(login.authenticated, true, `${scenario} must issue an authenticated session.`);
    assert.equal(String(session.body?.user?.id), String(user.id), `${scenario} must authenticate the expected user.`);
    assert.equal(session.body?.user?.role, user.role, `${scenario} must preserve the expected role.`);
    const dashboard = await client.request(dashboardPath(user.role), {
      expectedStatuses: [200],
      metric: { ...labels, metricName: 'dashboard-readiness' },
    });
    assert.equal(dashboard.status, 200, `${scenario} dashboard must be ready.`);
  } else {
    assert.equal(login.authenticated, false, `${scenario} must not issue an authenticated session.`);
    assert.equal(session.body?.user, undefined, `${scenario} must not expose an authenticated session.`);
    assert.equal(callbackError(login.callback, baseUrl), expectedError, `${scenario} must preserve its rejection error.`);
  }
}

async function runLoginBenchmark(models, fixture, baseUrl) {
  const firstObservationState = process.env.VIVA_STRESS_PROCESS_STATE || 'warm';
  assert.ok(['cold', 'warm'].includes(firstObservationState), 'VIVA_STRESS_PROCESS_STATE must be cold or warm.');
  const roleScenarios = [
    { user: { ...fixture.otherStudents[0], role: 'student' }, scenario: 'valid-student', ip: '198.51.110.1', warmState: firstObservationState },
    { user: { ...fixture.otherSupervisors[0], role: 'supervisor' }, scenario: 'valid-supervisor', ip: '198.51.110.2', warmState: 'warm' },
    { user: { ...fixture.admins[0], role: 'admin' }, scenario: 'valid-admin', ip: '198.51.110.3', warmState: 'warm' },
  ];
  for (const scenario of roleScenarios) {
    await runLoginScenario({
      baseUrl,
      ...scenario,
      concurrency: 1,
      hashFormat: 'scrypt',
      expectedOutcome: 'authenticated',
    });
  }

  await runLoginScenario({
    baseUrl,
    user: { ...fixture.otherStudents[1], role: 'student' },
    ip: '198.51.110.4',
    password: 'definitely-the-wrong-password',
    scenario: 'wrong-password',
    concurrency: 1,
    warmState: 'warm',
    hashFormat: 'scrypt',
    expectedOutcome: 'invalid-credentials',
    expectedError: 'Invalid roll number or password.',
  });
  await runLoginScenario({
    baseUrl,
    user: null,
    ip: '198.51.110.5',
    scenario: 'missing-user',
    concurrency: 1,
    warmState: 'warm',
    hashFormat: 'none',
    expectedOutcome: 'invalid-credentials',
    expectedError: 'Invalid roll number or password.',
  });
  await runLoginScenario({
    baseUrl,
    user: { ...fixture.inactiveStudent, role: 'student' },
    ip: '198.51.110.6',
    scenario: 'inactive-account',
    concurrency: 1,
    warmState: 'warm',
    hashFormat: 'scrypt',
    expectedOutcome: 'invalid-credentials',
    expectedError: 'Invalid roll number or password.',
  });
  await runLoginScenario({
    baseUrl,
    user: { ...fixture.otherStudents[2], role: 'student' },
    ip: null,
    scenario: 'missing-ip',
    concurrency: 1,
    warmState: 'warm',
    hashFormat: 'scrypt',
    expectedOutcome: 'authenticated',
  });

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    await runLoginScenario({
      baseUrl,
      user: { ...fixture.otherStudents[3], role: 'student' },
      ip: '198.51.110.7',
      password: 'definitely-the-wrong-password',
      scenario: 'account-limit-boundary',
      concurrency: 1,
      warmState: 'warm',
      hashFormat: 'scrypt',
      expectedOutcome: attempt <= 5 ? 'invalid-credentials' : 'rate-limited',
      expectedError: attempt <= 5
        ? 'Invalid roll number or password.'
        : 'Too many login attempts. Please try again in 15 minutes.',
    });
  }

  for (let attempt = 1; attempt <= 26; attempt += 1) {
    await runLoginScenario({
      baseUrl,
      user: null,
      rollNo: `HTTP-SHARED-IP-${attempt}`,
      ip: '198.51.110.8',
      scenario: 'shared-ip-limit-boundary',
      concurrency: 1,
      warmState: 'warm',
      hashFormat: 'none',
      expectedOutcome: attempt <= 25 ? 'invalid-credentials' : 'rate-limited',
      expectedError: attempt <= 25
        ? 'Invalid roll number or password.'
        : 'Too many login attempts. Please try again in 15 minutes.',
    });
  }

  const waves = [];
  for (const concurrency of STAGES) {
    const startedAt = performance.now();
    await Promise.all(fixture.panelAdmins.slice(0, concurrency).map((user, index) => runLoginScenario({
      baseUrl,
      user: { ...user, role: 'supervisor' },
      ip: `198.51.${120 + concurrency}.${index + 1}`,
      scenario: 'successful-login-wave',
      concurrency,
      warmState: 'warm',
      hashFormat: 'scrypt',
      expectedOutcome: 'authenticated',
    })));
    const durationMs = performance.now() - startedAt;
    waves.push({
      concurrency,
      samples: concurrency,
      durationMs,
      throughputPerSecond: Number((concurrency / (durationMs / 1_000)).toFixed(2)),
    });
  }

  await runLoginScenario({
    baseUrl,
    user: { ...fixture.legacyStudent, role: 'student' },
    ip: '198.51.130.1',
    scenario: 'legacy-first-login',
    concurrency: 1,
    warmState: 'warm',
    hashFormat: 'bcrypt',
    expectedOutcome: 'authenticated',
  });
  const upgradedLegacyUser = await models.User.findById(fixture.legacyStudent.id).select('+password').lean();
  assert.match(upgradedLegacyUser?.password || '', /^\$scrypt\$v1\$/, 'Legacy login must upgrade bcrypt to scrypt.');
  await runLoginScenario({
    baseUrl,
    user: { ...fixture.legacyStudent, role: 'student' },
    ip: '198.51.130.2',
    scenario: 'legacy-steady-state',
    concurrency: 1,
    warmState: 'warm',
    hashFormat: 'scrypt',
    expectedOutcome: 'authenticated',
  });

  await resetSessions(models, fixture);
  const panelAdmin = new HttpClient(baseUrl, '198.51.130.3');
  assert.equal(await panelAdmin.login(fixture.panelAdmins[0].rollNo), true, 'Viva restriction setup must authenticate its panel administrator.');
  await requestJson(panelAdmin, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'start', sessionId: fixture.sessions[0] },
  });
  for (const [index, restrictedUser] of [
    { ...fixture.vivaStudents[0], role: 'student' },
    { ...fixture.panelMembers[0], role: 'supervisor' },
  ].entries()) {
    await runLoginScenario({
      baseUrl,
      user: restrictedUser,
      ip: `198.51.130.${index + 4}`,
      scenario: index === 0 ? 'active-viva-student' : 'active-viva-panel-member',
      concurrency: 1,
      warmState: 'warm',
      hashFormat: 'scrypt',
      expectedOutcome: 'viva-restricted',
      expectedError: 'You cannot access the portal while your assigned Viva session is active.',
    });
  }
  await resetSessions(models, fixture);

  return { waves };
}

async function safeRequest(client, path, options, allowedStatuses, failures) {
  try {
    return await requestJson(client, path, options, allowedStatuses);
  } catch (error) {
    failures.push(error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240));
    return null;
  }
}

async function runTraffic(models, fixture, baseUrl, durationSeconds = 300) {
  assert.ok(Number.isInteger(durationSeconds) && durationSeconds >= 300 && durationSeconds <= 1_800, 'Traffic duration must be between 300 and 1800 seconds.');
  await resetSessions(models, fixture);

  const panelClients = await loginUsers(fixture, baseUrl, 50);
  const preauthenticatedStudents = await loginMany(baseUrl, fixture.vivaStudents.slice(0, 2), '198.51.101');
  const starts = await Promise.all(panelClients.map(({ user, client }, index) => requestJson(client, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'start', sessionId: fixture.sessions[index] },
  }).then((result) => ({ user, client, session: result.body.session }))));
  assert.equal(starts.filter(({ session }) => session?.phase === 'running').length, 50);
  assert.equal(await models.VivaParticipantLock.countDocuments({}), 200, 'All 50 active sessions must hold four participant locks.');

  const unrelatedStudents = await loginMany(baseUrl, fixture.otherStudents, '198.51.104');
  const unrelatedSupervisors = await loginMany(baseUrl, fixture.otherSupervisors, '198.51.105');
  const administrators = await loginMany(baseUrl, fixture.admins, '198.51.106');
  const failures = [];
  const versions = new Map();
  const initialGrades = await Promise.all(starts.map(async ({ client, session }) => {
    const result = await requestJson(client, '/api/dashboard/supervisor/viva', {
      method: 'POST',
      body: { action: 'save-grade', sessionId: session.id, version: session.version, grade: 'A' },
    });
    versions.set(session.id, result.body.session.version);
    return result;
  }));
  assert.equal(initialGrades.length, 50);

  const runReadCycle = async (cycle) => {
    await Promise.all(panelClients.map(({ client }) => safeRequest(client, '/api/dashboard/supervisor/viva', undefined, [200], failures)));
    await Promise.all(unrelatedStudents.map(({ client, user }) => safeRequest(client, '/api/dashboard/student', undefined, [200], failures)
      .then((result) => {
        const returnedId = result?.body?.student?._id;
        if (returnedId && String(returnedId) !== String(user.id)) failures.push('Unrelated student dashboard crossed an account boundary.');
      })));
    await Promise.all(unrelatedSupervisors.map(({ client }) => safeRequest(client, '/api/dashboard/supervisor', undefined, [200], failures)));
    await Promise.all(administrators.map(({ client }) => safeRequest(client, '/api/admin/viva', undefined, [200], failures)));
    await Promise.all(preauthenticatedStudents.map(({ client }) => safeRequest(client, '/api/dashboard/viva-access', undefined, [200], failures)
      .then((result) => {
        if (result?.body?.restricted !== true) failures.push('Pre-authenticated Viva student lost its active-session restriction.');
      })));
    if (cycle % 5 === 0) {
      await Promise.all(starts.map(async ({ client, session }, index) => {
        const version = versions.get(session.id);
        const result = await safeRequest(client, '/api/dashboard/supervisor/viva', {
          method: 'POST',
          body: { action: 'save-grade', sessionId: session.id, version, grade: index % 2 ? 'A' : 'A+' },
        }, [200], failures);
        if (result?.body?.session?.version !== undefined) versions.set(session.id, result.body.session.version);
      }));
    }
  };

  const startedAt = Date.now();
  let cycles = 0;
  let stopTraffic = false;
  const traffic = (async () => {
    while (!stopTraffic && Date.now() - startedAt < durationSeconds * 1_000) {
      await runReadCycle(cycles);
      cycles += 1;
      await wait(1_000);
    }
  })().catch((error) => {
    stopTraffic = true;
    failures.push(error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240));
  });
  let loginWaveFailure = null;
  try {
    const freshStudents = await Promise.all(fixture.vivaStudents.map((user, index) => ({
      user,
      client: new HttpClient(baseUrl, `198.51.102.${index + 1}`),
    })).map(async ({ user, client }) => ({ user, client, ok: await client.login(user.rollNo) })));
    assert.ok(freshStudents.every(({ ok }) => !ok), 'Fresh Viva student logins must be rejected during active traffic.');
    const freshPanelMembers = await Promise.all(fixture.panelMembers.map((user, index) => ({
      user,
      client: new HttpClient(baseUrl, `198.51.103.${index + 1}`),
    })).map(async ({ user, client }) => ({ user, client, ok: await client.login(user.rollNo) })));
    assert.ok(freshPanelMembers.every(({ ok }) => !ok), 'Fresh non-admin panel-member logins must be rejected during active traffic.');
  } catch (error) {
    loginWaveFailure = error;
    stopTraffic = true;
  }
  await traffic;
  if (loginWaveFailure) throw loginWaveFailure;
  assert.equal(failures.length, 0, `Mixed traffic had ${failures.length} unexpected failures: ${failures.slice(0, 3).join(' | ')}`);

  await Promise.all(starts.map(({ client, session }) => requestJson(client, '/api/dashboard/supervisor/viva', {
    method: 'POST',
    body: { action: 'complete', sessionId: session.id, version: versions.get(session.id) },
  })));
  const gradesPerSession = 2 + Math.floor((cycles - 1) / 5);
  await assertInvariants(models, fixture, 50, gradesPerSession);
  return { sessions: 50, activeTrafficSeconds: Math.round((Date.now() - startedAt) / 1_000), cycles, gradesPerSession, failures: failures.length };
}

async function collectSourceIdentity() {
  try {
    const [{ stdout: commit }, { stdout: changed }, { stdout: untracked }] = await Promise.all([
      execFileAsync('git', ['rev-parse', 'HEAD']),
      execFileAsync('git', ['diff', '--name-only', 'HEAD']),
      execFileAsync('git', ['ls-files', '--others', '--exclude-standard']),
    ]);
    const dirtyFiles = [...new Set(`${changed}\n${untracked}`.trim().split('\n').filter(Boolean))].sort();
    const dirtyFileHashes = Object.fromEntries(await Promise.all(dirtyFiles.map(async (file) => {
      try {
        return [file, createHash('sha256').update(await readFile(file)).digest('hex')];
      } catch {
        return [file, 'deleted'];
      }
    })));
    return { commit: commit.trim(), dirtyFileHashes };
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) };
  }
}

async function packageVersion(name) {
  try {
    const manifest = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
    return manifest.version || 'unknown';
  } catch {
    return 'unavailable';
  }
}

async function collectRunEnvironment() {
  const [nextVersion, mongooseVersion, nextAuthVersion, source] = await Promise.all([
    packageVersion('next'),
    packageVersion('mongoose'),
    packageVersion('next-auth'),
    collectSourceIdentity(),
  ]);
  const memory = process.memoryUsage();
  return {
    versions: { node: process.version, next: nextVersion, mongoose: mongooseVersion, nextAuth: nextAuthVersion },
    source,
    cpu: {
      availableParallelism: os.availableParallelism(),
      logicalCpus: os.cpus().length,
      runnerWorkerCount: Number(process.env.UV_THREADPOOL_SIZE || 4),
      declaredServerWorkerCount: process.env.VIVA_STRESS_SERVER_UV_THREADPOOL_SIZE
        ? Number(process.env.VIVA_STRESS_SERVER_UV_THREADPOOL_SIZE)
        : 'unreported',
    },
    processMemoryBytes: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      external: memory.external,
    },
  };
}

async function collectDatabaseConfiguration() {
  const database = mongoose.connection.db;
  if (!database) return { unavailable: 'Database connection is not open.' };
  const collections = ['users', 'ratelimits', 'vivaparticipantlocks'];
  const indexes = {};
  for (const collectionName of collections) {
    try {
      indexes[collectionName] = (await database.collection(collectionName).indexes()).map((index) => ({
        name: index.name,
        key: index.key,
        expireAfterSeconds: index.expireAfterSeconds,
        partialFilterExpression: index.partialFilterExpression,
      }));
    } catch (error) {
      indexes[collectionName] = { unavailable: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) };
    }
  }
  const summarizeExplain = (explain) => {
    const indexNames = new Set();
    const visit = (value) => {
      if (!value || typeof value !== 'object') return;
      if (typeof value.indexName === 'string') indexNames.add(value.indexName);
      for (const nested of Object.values(value)) visit(nested);
    };
    visit(explain.queryPlanner?.winningPlan);
    return {
      nReturned: explain.executionStats?.nReturned,
      totalKeysExamined: explain.executionStats?.totalKeysExamined,
      totalDocsExamined: explain.executionStats?.totalDocsExamined,
      indexes: [...indexNames],
    };
  };
  const [userExplain, rateLimitExplain] = await Promise.all([
    database.collection('users').find({ rollNo: 'HTTP-0001' }).explain('executionStats'),
    database.collection('ratelimits').find({ identifier: { $in: ['login:account:benchmark', 'login:ip:benchmark'] } }).explain('executionStats'),
  ]);
  const buildInfo = await database.command({ buildInfo: 1 });
  return {
    version: buildInfo.version || 'unknown',
    indexes,
    queryPlans: {
      normalizedUserLookup: summarizeExplain(userExplain),
      loginRateLimits: summarizeExplain(rateLimitExplain),
    },
  };
}

async function compareWithBaseline(metricsSummary) {
  const baselinePath = process.env.VIVA_STRESS_BASELINE_REPORT;
  if (!baselinePath) return null;
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const baselineMetrics = Array.isArray(baseline.metrics) ? baseline.metrics : [];
  const key = (metric) => JSON.stringify([metric.name, metric.labels]);
  const baselineByKey = new Map(baselineMetrics.map((metric) => [key(metric), metric]));
  return metricsSummary.flatMap((candidate) => {
    const previous = baselineByKey.get(key(candidate));
    if (!previous || !previous.p95Ms) return [];
    return [{
      name: candidate.name,
      labels: candidate.labels,
      baselineP95Ms: previous.p95Ms,
      candidateP95Ms: candidate.p95Ms,
      p95ChangePercent: Number((((candidate.p95Ms - previous.p95Ms) / previous.p95Ms) * 100).toFixed(2)),
    }];
  });
}

async function collectServerPhaseTimings() {
  const logPath = process.env.VIVA_STRESS_SERVER_LOG;
  if (!logPath) return null;
  const samples = (await readFile(logPath, 'utf8')).split('\n').flatMap((line) => {
    const marker = line.indexOf('login_phase_timing ');
    if (marker < 0) return [];
    try {
      return [JSON.parse(line.slice(marker + 'login_phase_timing '.length))];
    } catch {
      return [];
    }
  });
  const groups = new Map();
  for (const sample of samples) {
    for (const [phase, durationMs] of Object.entries({ total: sample.totalMs, ...sample.phases })) {
      if (!Number.isFinite(durationMs)) continue;
      const key = `${sample.outcome || 'unknown'}:${phase}`;
      const durations = groups.get(key) || [];
      durations.push(durationMs);
      groups.set(key, durations);
    }
  }
  return [...groups].map(([key, durations]) => {
    durations.sort((left, right) => left - right);
    const percentile = (fraction) => durations[Math.max(0, Math.ceil(durations.length * fraction) - 1)] || 0;
    const [outcome, phase] = key.split(':');
    return { outcome, phase, samples: durations.length, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: durations.at(-1) || 0 };
  });
}

async function writeReport(report) {
  await mkdir(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = `${REPORT_DIR}/viva-http-stress-${stamp}.json`;
  const markdownPath = `${REPORT_DIR}/viva-http-stress-${stamp}.md`;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, [
    '# Viva HTTP stress report',
    '',
    `- Status: **${report.status}**`,
    `- Database: ${report.database}`,
    `- Stages: ${report.stages.map((stage) => stage.sessions || stage.concurrency || report.stage).join(', ')}`,
    `- Unexpected failures: ${report.unexpectedFailures}`,
    '',
    '## Action metrics',
    '',
    '```json',
    JSON.stringify(report.metrics, null, 2),
    '```',
    ...(report.serverPhaseTimings ? [
      '',
      '## Server phase timings',
      '',
      '```json',
      JSON.stringify(report.serverPhaseTimings, null, 2),
      '```',
    ] : []),
    ...(report.comparison ? [
      '',
      '## Baseline comparison',
      '',
      '```json',
      JSON.stringify(report.comparison, null, 2),
      '```',
    ] : []),
    '',
  ].join('\n'));
  return { jsonPath, markdownPath };
}

export async function runVivaHttpStress({ stage = 'stress' } = {}) {
  if (stage === 'soak') {
    throw new Error('The optional soak phase is intentionally paused at the model-switch checkpoint; run the short stress stages first.');
  }
  const requestedSessions = stage === 'preflight' ? 1 : SESSION_CEILING;
  const { baseUrl, databaseUrl } = guardEnvironment(requestedSessions);
  const models = await loadModels();
  const startedAt = new Date();
  const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
  eventLoopDelay.enable();
  metrics.reset();
  let fixture;
  const stages = [];
  let status = 'passed';
  let failure = null;
  try {
    fixture = await seedFixture(models);
    if (stage !== 'login') {
      const portal = await requestJson(new HttpClient(baseUrl, '198.51.100.250'), '/api/portal-status');
      assert.equal(portal.body?.paused, false, 'The local portal must not be paused.');
    }
    if (stage === 'traffic') {
      stages.push(await runTraffic(models, fixture, baseUrl, TRAFFIC_DURATION_SECONDS));
    } else if (stage === 'login') {
      const loginBenchmark = await runLoginBenchmark(models, fixture, baseUrl);
      stages.push(...loginBenchmark.waves);
    } else if (stage !== 'preflight') {
      for (const count of STAGES) stages.push({ sessions: count, ...(await runStage(models, fixture, baseUrl, count)) });
    } else {
      const smoke = new HttpClient(baseUrl, '198.51.100.251');
      assert.equal(await smoke.login(fixture.panelAdmins[0].rollNo), true);
      await requestJson(smoke, '/api/dashboard/supervisor/viva');
    }
    const trafficGradeCount = stages[0]?.gradesPerSession ?? null;
    const expectedCompletedSessions = ['preflight', 'login'].includes(stage) ? 0 : 50;
    await assertInvariants(models, fixture, expectedCompletedSessions, stage === 'traffic' ? trafficGradeCount : null);
  } catch (error) {
    status = 'failed';
    failure = error instanceof Error ? error.message : String(error);
  } finally {
    eventLoopDelay.disable();
    const metricSummary = metrics.summary();
    const unexpectedHttpResponses = metricSummary.reduce((total, action) => total + action.unexpected, 0);
    const [environment, databaseConfiguration, comparison, serverPhaseTimings] = await Promise.all([
      collectRunEnvironment().catch((error) => ({ unavailable: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) })),
      collectDatabaseConfiguration().catch((error) => ({ unavailable: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) })),
      compareWithBaseline(metricSummary).catch((error) => ({ unavailable: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) })),
      collectServerPhaseTimings().catch((error) => ({ unavailable: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200) })),
    ]);
    const report = {
      status,
      database: new URL(databaseUrl).pathname.slice(1),
      baseUrl,
      stage,
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      seed: 'viva-http-stress-v1',
      workload: { panels: 50, sessions: 50, vivaStudents: 100, panelSupervisors: 100, unrelatedStudents: 25, unrelatedSupervisors: 20, administrators: 2, loginOnlyAccounts: 2 },
      stages,
      metrics: metricSummary,
      environment: {
        ...environment,
        eventLoopDelayMs: {
          mean: Number((eventLoopDelay.mean / 1e6).toFixed(2)),
          p95: Number((eventLoopDelay.percentile(95) / 1e6).toFixed(2)),
          max: Number((eventLoopDelay.max / 1e6).toFixed(2)),
        },
      },
      databaseConfiguration,
      serverPhaseTimings,
      comparison,
      databaseRetained: KEEP_DATABASE,
      unexpectedFailures: unexpectedHttpResponses + (failure ? 1 : 0),
      failure,
    };
    let artifacts;
    try {
      artifacts = await writeReport(report);
      report.artifacts = artifacts;
    } finally {
      if (mongoose.connection.readyState !== 0 && !KEEP_DATABASE) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      } else if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
    console.log(JSON.stringify({ status: report.status, stage, artifacts, metrics: report.metrics, failure: report.failure }));
    if (failure) throw new Error(failure);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stage = process.env.VIVA_STRESS_STAGE || 'stress';
  if (!['preflight', 'login', 'stress', 'traffic', 'soak'].includes(stage)) throw new Error('VIVA_STRESS_STAGE must be preflight, login, stress, traffic, or soak.');
  if (stage === 'soak' && process.env.VIVA_STRESS_ALLOW_SOAK !== '1') throw new Error('Soak is gated. Set VIVA_STRESS_ALLOW_SOAK=1 only after the model-switch checkpoint.');
  await runVivaHttpStress({ stage });
}
