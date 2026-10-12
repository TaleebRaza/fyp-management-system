import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import mongoose from 'mongoose';
import { HttpClient, metrics } from './viva-http-stress-runner.mjs';
import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';

const baseUrl = process.env.PORTAL_STRESS_BASE_URL || 'http://127.0.0.1:3191';
const mongoUri = process.env.PORTAL_STRESS_MONGODB_URI || '';
const password = 'Local-only-2026!';
const artifactDir = process.env.PORTAL_STRESS_ARTIFACT_DIR || '.local-bench/portal-load-baseline';
const report = { startedAt: new Date().toISOString(), failures: [], loginOutcomes: {}, phases: [] };
const loopback = new Set(['127.0.0.1', 'localhost', '::1']);
const appUrl = new URL(baseUrl);
const dbUrl = new URL(mongoUri);
assert.ok(loopback.has(appUrl.hostname) && loopback.has(dbUrl.hostname), 'Portal stress accepts loopback targets only.');
assert.equal(dbUrl.pathname, '/fyp_portal_stress_test', 'Use the dedicated test database.');
assert.equal(dbUrl.searchParams.get('replicaSet'), 'rs0', 'Use the local rs0 transaction replica set.');

const [User, Project, VivaSession, VivaAuditEvent] = await Promise.all(['User', 'Project', 'VivaSession', 'VivaAuditEvent'].map(async (name) =>
  (await importTypeScriptModuleWithDependencies(`models/${name}.ts`)).default));
const models = { User, Project, VivaSession, VivaAuditEvent };
const record = (action, started, status, expected = true, error = null) => metrics.record(action, status, performance.now() - started, { expected, error });
const drain = async (tasks, label) => {
  const results = await Promise.allSettled(tasks);
  const rejected = results.filter((result) => result.status === 'rejected');
  if (rejected.length) throw new AggregateError(rejected.map(({ reason }) => reason),
    `${label}: ${rejected.length} operation(s) failed: ${rejected.slice(0, 5).map(({ reason }) => String(reason)).join(' | ')}`);
  return results.map(({ value }) => value);
};
const client = (index) => new HttpClient(appUrl.origin, `198.18.${Math.floor(index / 250) + 1}.${index % 250 + 1}`);
const failures = [];
let appProcess;
const checked = async (http, path, method = 'GET', body, action, statuses = [200]) => {
  const result = await http.request(path, { method, body, expectedStatuses: statuses, metric: { phase: report.phase, actionName: action } });
  assert.ok(statuses.includes(result.status), `${action}: HTTP ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
};
const studentAction = (http, action, data = {}) => checked(http, '/api/dashboard/student', 'POST', { action, ...data }, action);
const authenticate = async (user, ip) => {
  const http = client(ip);
  const result = await http.loginAttempt({ rollNo: user.rollNo, password, labels: { phase: report.phase, actionName: 'login' } });
  const identity = result.authenticated ? await checked(http, '/api/auth/session', 'GET', undefined, 'session-identity') : null;
  if (result.authenticated) assert.equal(identity.user?.id, String(user._id), `Login identity mismatch for ${user.rollNo}`);
  return { http, authenticated: result.authenticated, identity };
};
const authenticateBatch = async (users, firstIp, size = 25) => {
  const actors = [];
  for (let offset = 0; offset < users.length; offset += size) {
    actors.push(...await drain(users.slice(offset, offset + size)
      .map((user, index) => authenticate(user, firstIp + offset + index)), 'Actor login setup'));
  }
  return actors;
};

// Local sink for reset OTPs; credentials are synthetic and this listener never sends mail externally.
const mail = [];
const smtp = net.createServer((socket) => {
  let buffer = '';
  let dataMode = false;
  let recipient = '';
  socket.write('220 localhost ESMTP\r\n');
  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    while (buffer) {
      if (dataMode) {
        const end = buffer.indexOf('\r\n.\r\n');
        if (end < 0) break;
        mail.push({ recipient, raw: buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.') });
        buffer = buffer.slice(end + 5);
        dataMode = false;
        socket.write('250 queued locally\r\n');
        continue;
      }
      const end = buffer.indexOf('\r\n');
      if (end < 0) break;
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const command = line.split(' ', 1)[0].toUpperCase();
      if (command === 'EHLO' || command === 'HELO') socket.write('250-localhost\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 10485760\r\n');
      else if (command === 'AUTH') socket.write('235 authenticated\r\n');
      else if (command === 'RCPT') { recipient = /<([^>]+)>/.exec(line)?.[1] || ''; socket.write('250 ok\r\n'); }
      else if (command === 'DATA') { dataMode = true; socket.write('354 end with dot\r\n'); }
      else if (command === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
      else socket.write('250 ok\r\n');
    }
  });
});

async function startApplication() {
  const appDir = path.resolve(process.env.PORTAL_STRESS_APP_DIR || '');
  assert.ok(appDir.startsWith('/tmp/fyp-portal-load-'), 'Run the stress target from its disposable production copy.');
  appProcess = spawn(process.execPath, [path.join(appDir, 'node_modules/next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', appUrl.port || '3000'], {
    cwd: appDir, env: process.env, stdio: 'ignore',
  });
  let exited = false;
  let exitCode;
  appProcess.once('exit', (code) => { exited = true; exitCode = code; });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (exited) throw new Error(`Disposable Next.js process exited during startup (${exitCode}).`);
    try {
      const response = await fetch(new URL('/api/auth/csrf', appUrl), { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) return;
    } catch {}
    await delay(500);
  }
  throw new Error('Disposable Next.js process did not become ready within 30 seconds.');
}

try {
  await mongoose.connect(mongoUri, { maxPoolSize: 30 });
  await new Promise((resolve, reject) => {
    smtp.once('error', reject);
    smtp.listen(1025, '127.0.0.1', resolve);
  });
  await startApplication();
  assert.equal(await User.countDocuments({ role: 'student' }), 1000);
  assert.equal(await Project.countDocuments(), 500);
  const sessions = await VivaSession.find({}).sort({ _id: 1 }).lean();
  assert.equal(sessions.length, 100);
  const projects = await Project.find({}).sort({ createdAt: 1, _id: 1 }).lean();
  const students = await User.find({ role: 'student' }).sort({ createdAt: 1, _id: 1 }).lean();
  const supervisors = await User.find({ role: 'supervisor' }).sort({ createdAt: 1, _id: 1 }).lean();
  const adminUser = await User.findOne({ role: 'admin' }).lean();
  assert.equal(supervisors.length, 500);
  await VivaSession.updateMany({}, { $set: { scheduledAt: new Date(Date.now() - 60_000) } });

  const roundId = String(sessions[0].roundId);
  const panelAdmins = supervisors.filter((_, index) => index % 2 === 0).slice(0, 100);
  const allVivaStudentIds = new Set(sessions.flatMap((session) =>
    (session.projectSnapshot?.members || []).map(({ userId }) => String(userId))));
  const activeVivaIds = new Set(sessions.slice(0, 50).flatMap((session) =>
    (session.projectSnapshot?.members || []).map(({ userId }) => String(userId))));
  const vivaLoginUsers = students.filter((student) => student.isActive && activeVivaIds.has(String(student._id))).slice(0, 25);
  assert.equal(vivaLoginUsers.length, 25);
  const resetProjects = projects.slice(120, 170);
  const remainingProjects = projects.slice(200);
  const uploadProjects = remainingProjects.filter(({ pdfUrl }) => !pdfUrl).slice(0, 50);
  const afterUploads = remainingProjects.filter((project) => !uploadProjects.includes(project));
  const supervisorProjects = afterUploads.slice(0, 50);
  const sourceProjects = afterUploads.slice(50, 100);
  const targetProjects = afterUploads.slice(100, 150);
  const unusedIds = new Set([...resetProjects, ...uploadProjects, ...supervisorProjects, ...sourceProjects, ...targetProjects]
    .flatMap((project) => project.members.map(String)));
  const unusedStudents = students.filter((student) => !unusedIds.has(String(student._id)));
  const eligibleNonViva = unusedStudents.filter(({ isActive, _id }) => isActive && !allVivaStudentIds.has(String(_id)));
  const passwordStudents = eligibleNonViva.slice(0, 50);
  const loginStudents = eligibleNonViva.slice(50, 75);
  const studentById = new Map(students.map((student) => [String(student._id), student]));
  const activeProjectMember = (project) => project.members.map((id) => studentById.get(String(id))).find((student) => student?.isActive);
  assert.equal(resetProjects.length + uploadProjects.length + supervisorProjects.length + sourceProjects.length + targetProjects.length, 250);

  // Make the upload group eligible and destination teams large enough for one transfer each.
  assert.equal(uploadProjects.length, 50, 'Need 50 unsubmitted synthetic projects for upload load.');
  await Project.updateMany({ _id: { $in: uploadProjects.map(({ _id }) => _id) } }, { $set: { status: 'Pending', stage: 'PROPOSAL' } });
  await Project.updateMany({ _id: { $in: supervisorProjects.map(({ _id }) => _id) } }, { $set: {
    status: 'Pending', stage: 'PROPOSAL',
  } });
  await Project.updateMany({ _id: { $in: targetProjects.map(({ _id }) => _id) } }, { $set: { maxTeamSize: 3 } });
  const noFine = { lateRegistrationDays: 0, lateRegistrationFine: 0, lateRegistrationFineStatus: 'resolved', 'registrationPunishment.active': false };
  const unrestrictedIds = [...new Set([...uploadProjects, ...sourceProjects].flatMap(({ members }) => members.map(String)))];
  await User.updateMany({ _id: { $in: unrestrictedIds } }, { $set: noFine });
  const teamMoves = [];
  for (const [index, source] of sourceProjects.entries()) {
    const actor = activeProjectMember(source);
    const target = targetProjects[index];
    await User.updateOne({ _id: target.members[0] }, { $set: { program: actor.program } });
    teamMoves.push({ actor, target });
  }

  report.setup = { students: students.length, supervisors: supervisors.length, projects: projects.length,
    rounds: new Set(sessions.map(({ roundId: id }) => String(id))).size, sessions: sessions.length,
    initialDatabase: dbUrl.pathname.slice(1), storageBucket: 'fyp-portal-stress-test',
    node: process.version, mongo: (await mongoose.connection.db.admin().serverStatus()).version,
    cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem() };
  report.phase = 'authentication-and-initial-start';
  const admin = await authenticate({ ...adminUser, role: 'admin' }, 1);
  assert.equal(admin.authenticated, true);
  const panelActors = await authenticateBatch(panelAdmins, 2);
  assert.ok(panelActors.every(({ authenticated }) => authenticated));
  const resetActors = await authenticateBatch(resetProjects.map(activeProjectMember), 200);
  const uploadActors = await authenticateBatch(uploadProjects.map(activeProjectMember), 300);
  const supervisorActors = await authenticateBatch(supervisorProjects.map(activeProjectMember), 400);
  const teamActors = await authenticateBatch(teamMoves.map(({ actor }) => actor), 450);
  await checked(panelActors[0].http, '/api/dashboard/supervisor/viva', 'GET', undefined, 'panel-auth-probe');
  metrics.reset();

  const startFirst = async () => drain(sessions.slice(0, 50).map(async (session, index) => {
    const body = await checked(panelActors[index].http, '/api/dashboard/supervisor/viva', 'POST',
      { action: 'start', sessionId: String(session._id) }, 'start-viva');
    assert.equal(body.session.phase, 'running');
    return { session, actor: panelActors[index], workspace: body.session };
  }), 'Initial 50 Viva starts');
  const initial = await startFirst();
  report.phase = 'mixed-load';
  const loginWave = await drain([...vivaLoginUsers, ...loginStudents].map((user, index) => authenticate(user, 500 + index)), 'Concurrent login wave');
  const vivaLogins = loginWave.slice(0, 25).filter(({ authenticated }) => authenticated).length;
  const nonVivaLogins = loginWave.slice(25).filter(({ authenticated }) => authenticated).length;
  report.loginOutcomes = { concurrentAttempts: 50, activeVivaStudentsAuthenticated: vivaLogins,
    nonVivaStudentsAuthenticated: nonVivaLogins, expectedActiveVivaRejections: 25 };
  assert.equal(nonVivaLogins, 25);
  assert.equal(vivaLogins, 0);

  const passwordFlow = async (user, index) => {
    const http = client(700 + index);
    const email = user.email;
    await checked(http, '/api/auth/forgot-password', 'POST', { email }, 'password-reset-request');
    const message = await new Promise((resolve, reject) => {
      const deadline = Date.now() + 10_000;
      const timer = setInterval(() => {
        const found = mail.find((item) => item.recipient.toLowerCase() === email.toLowerCase());
        if (found) { clearInterval(timer); resolve(found); }
        else if (Date.now() > deadline) { clearInterval(timer); reject(new Error(`Reset email missing for ${email}`)); }
      }, 10);
    });
    const otp = /reset code is (\d{6})/i.exec(message.raw)?.[1];
    assert.ok(otp, `OTP missing for ${email}`);
    const verified = await checked(http, '/api/auth/verify-reset-otp', 'POST', { email, otp }, 'password-reset-verify');
    await checked(http, '/api/auth/reset-password', 'POST', {
      email, resetToken: verified.resetToken, newPassword: 'Load-test-new-password-2026!'
    }, 'password-reset-complete');
  };
  const uploadFlow = async (http, index) => {
    const key = `portal-load-${index}-${Date.now()}`;
    const bytes = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    const reservation = await checked(http, '/api/upload', 'POST', {
      filename: `load-${index}.pdf`, contentType: 'application/pdf', fileSize: bytes.length, idempotencyKey: key,
    }, 'project-upload-reserve');
    const started = performance.now();
    const response = await fetch(reservation.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
    record('project-upload-transfer', started, response.status, response.status === 200 || response.status === 204);
    assert.ok(response.ok, `Local storage PUT returned ${response.status}`);
    await studentAction(http, 'submitProject', { title: `Load project ${index}`, desc: 'Synthetic load-test submission',
      tools: 'Next.js', domains: ['web-applications'], pdfUrl: reservation.url });
  };
  const studentActionWithData = async (http, action, body) => checked(http, '/api/dashboard/student', 'POST', { action, ...body }, action);
  const otherActions = [
    ...resetProjects.map((_, index) => studentAction(resetActors[index].http, 'resetProject')),
    ...passwordStudents.map(passwordFlow),
    ...uploadProjects.map((_, index) => uploadFlow(uploadActors[index].http, index)),
    ...supervisorProjects.map((project, index) => {
      const userId = String(activeProjectMember(project)._id);
      return studentActionWithData(supervisorActors[index].http, 'changeSupervisor', {
        id: userId, supervisorId: String(supervisors[300 + index]._id),
      });
    }),
    ...teamMoves.map(({ target }, index) => checked(teamActors[index].http, '/api/project/join', 'POST',
      { inviteCode: target.inviteCode }, 'team-change')),
  ];

  const dashboards = [
    ...loginStudents.map((_, index) => checked(loginWave[25 + index].http, '/api/dashboard/student', 'GET', undefined, 'student-dashboard')),
    ...initial.map(({ actor }) => checked(actor.http, '/api/dashboard/supervisor/viva', 'GET', undefined, 'viva-dashboard')),
  ];
  const parallelGradeAndStart = [
    ...initial.map(({ actor, workspace }) => checked(actor.http, '/api/dashboard/supervisor/viva', 'POST', {
      action: 'save-grade', sessionId: workspace.id, version: workspace.version, grade: 'A',
    }, 'grade-save')),
    ...sessions.slice(50).map((session, offset) => checked(panelActors[offset + 50].http,
      '/api/dashboard/supervisor/viva', 'POST', { action: 'start', sessionId: String(session._id) }, 'start-viva')),
  ];
  const [actionResults, dashboardResults, gradeStartResults] = await Promise.all([
    drain(otherActions, 'Project and account writes'),
    drain(dashboards, 'Dashboard reads'),
    drain(parallelGradeAndStart, 'Concurrent grade saves and session starts'),
  ]);
  report.actionCount = actionResults.length;
  report.dashboardReads = dashboardResults.length;
  report.gradeAndStartCount = gradeStartResults.length;
  report.concurrentGradeSaves = 50;
  report.additionalVivaStarts = 50;
  report.acceptedGradeAudits = await VivaAuditEvent.countDocuments({ roundId, event: 'grade-recorded' });
  assert.equal(report.acceptedGradeAudits, 50);

  report.phase = 'session-cancellation';
  const cancelStarted = await drain(sessions.map(async (session) => {
    const current = await VivaSession.findById(session._id).lean();
    return checked(admin.http, '/api/admin/viva', 'PATCH', { action: 'cancel-session', sessionId: String(session._id),
      version: current.version, cancellationReason: 'Load test completed.' }, 'session-cancel');
  }), 'Viva session cancellations');
  report.cancelledSessions = cancelStarted.length;
  report.phase = 'verification';
  assert.equal(await User.countDocuments({ role: 'student' }), 1000);
  assert.equal(await Project.countDocuments(), 550);
  assert.equal(await VivaSession.countDocuments({ roundId, cancelledAt: { $type: 'date' } }), 100);
  report.status = 'passed';
} catch (error) {
  failures.push(String(error?.stack || error));
  report.status = 'failed';
} finally {
  report.endedAt = new Date().toISOString();
  report.failures = failures;
  report.metrics = metrics.summary();
  report.requests = report.metrics.filter((row) => row.name !== 'csrf-plus-callback')
    .reduce((sum, row) => sum + row.requests, 0);
  report.droppedRequests = report.metrics.reduce((sum, row) => sum + (row.statuses['0'] || 0), 0);
  report.unexpectedResponses = report.metrics.reduce((sum, row) => sum + row.unexpected, 0);
  report.errors = report.metrics.filter((row) => row.errors || row.unexpected).map(({ name, statuses, errors, unexpected }) => ({ name, statuses, errors, unexpected }));
  report.localOtpEmailsCaptured = mail.length;
  await mkdir(artifactDir, { recursive: true });
  await writeFile(`${artifactDir}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, requests: report.requests, dropped: report.droppedRequests,
    unexpected: report.unexpectedResponses, artifact: `${artifactDir}/report.json` }));
  smtp.close();
  appProcess?.kill('SIGTERM');
  if (mongoose.connection.readyState) await mongoose.disconnect();
}
if (report.status !== 'passed') process.exitCode = 1;
