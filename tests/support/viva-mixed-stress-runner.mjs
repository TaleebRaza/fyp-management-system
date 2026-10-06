import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import mongoose from 'mongoose';
import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';
import { guardEnvironment, HttpClient, metrics, loadModels, seedFixture, collectRunEnvironment } from './viva-http-stress-runner.mjs';

const durationSeconds = Number(process.env.VIVA_MIXED_SECONDS || 600);
const largeFixture = process.env.VIVA_MIXED_LARGE_FIXTURE !== '0';
const activeCount = Number(process.env.VIVA_MIXED_ACTIVE_SESSIONS || 50);
assert.ok([50, 75].includes(activeCount), 'Use 50 sessions for comparison or 75 for headroom.');
const loginWave = [Math.round(activeCount * 0.8), activeCount];
const expectedMemberships = (largeFixture ? 4650 : 0) + 150 + activeCount * 2;
assert.ok(Number.isInteger(durationSeconds) && durationSeconds >= 60 && durationSeconds <= 1800);
const { baseUrl } = guardEnvironment(75);
const reportDir = process.env.VIVA_STRESS_ARTIFACT_DIR || '/tmp/fyp-viva-mixed-stress';
const models = await loadModels();
const report = { status: 'running', startedAt: new Date().toISOString(), durationSeconds,
  workload: { scheduled: 75, active: activeCount, loginWave, studentWriters: activeCount, studentAnchors: activeCount,
    databaseUsers: (largeFixture ? 5077 : 0) + 324 + activeCount * 2, databaseProjects: (largeFixture ? 2325 : 0) + 75 + activeCount * 2 },
  failures: [], checks: [], phases: [], loginWaves: [] };
let phase = 'setup';
let fixture;
let stop = false;
let nextIp = 1;
const client = () => new HttpClient(baseUrl, `198.18.${Math.floor(nextIp / 250)}.${nextIp++ % 250 + 1}`);
const call = async (http, path, method, body, action, statuses = [200]) => {
  const response = await http.request(path, { method, body, expectedStatuses: statuses, metric: { phase, actionName: action } });
  assert.ok(statuses.includes(response.status), `${action}: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body;
};
const studentAction = (http, action, fields = {}, statuses) => call(http, '/api/dashboard/student', 'POST', { action, ...fields }, action, statuses);
const authenticate = async (user, loginPhase = phase) => {
  const http = client();
  const result = await http.loginAttempt({ rollNo: user.rollNo, labels: { phase: loginPhase, actionName: 'login' } });
  assert.equal(result.authenticated, true, `Login failed for ${user.rollNo}: ${JSON.stringify(result.callback.body)}`);
  const session = await call(http, '/api/auth/session', 'GET', undefined, 'session-identity');
  assert.equal(session.user?.id, user.id, 'Session belongs to another account.');
  return { http, user };
};
const recordFailure = (error) => report.failures.push(String(error?.stack || error).slice(0, 1600));
const attempt = async (task) => { try { return await task(); } catch (error) { recordFailure(error); return null; } };
const runLoop = async (deadline, delay, task) => {
  let cycles = 0;
  while (!stop && Date.now() < deadline) { await attempt(() => task(cycles++)); await wait(delay); }
  return cycles;
};
async function assertState(active, completed = 0, full = true) {
  assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId }), 75);
  assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId, startedAt: { $type: 'date' }, completedAt: null }), active);
  assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId, completedAt: { $type: 'date' } }), completed);
  assert.equal(await models.VivaSession.countDocuments({ roundId: fixture.roundId, startedAt: null }), 75 - activeCount);
  assert.equal(await models.VivaParticipantLock.countDocuments({}), active * 4);
  if (!full) {
    report.checks.push({ at: new Date().toISOString(), phase, active, completed, participantLocks: active * 4 });
    return;
  }
  const memberships = await models.Project.aggregate([
    { $unwind: '$members' }, { $group: { _id: '$members', count: { $sum: 1 } } }, { $match: { count: { $ne: 1 } } },
  ]);
  assert.deepEqual(memberships, [], 'A student appears in multiple teams.');
  const memberCount = await models.Project.aggregate([{ $unwind: '$members' }, { $count: 'count' }]);
  assert.equal(memberCount[0]?.count, expectedMemberships, 'A student lost their project membership.');
  const projects = await models.Project.find().lean();
  assert.ok(projects.every((project) => project.members.length > 0 && project.members.length <= project.maxTeamSize));
  for (const supervisor of await models.User.find({ role: 'supervisor' }).lean()) {
    assert.equal(supervisor.occupiedSlots, projects.filter((project) => String(project.supervisorId) === String(supervisor._id)).length,
      `Incorrect capacity counter for ${supervisor.rollNo}`);
  }
  assert.equal(await mongoose.connection.collection('uploadreservations').countDocuments(), 0, 'Unexpected PDF upload reservation.');
  const ledger = await models.SystemConfig.findOne({ configKey: 'storage' }).lean();
  assert.equal(ledger.usedBytes, 0); assert.equal(ledger.reservedBytes, 0);
  assert.equal((await models.RegistrationPolicy.findOne().lean()).projectSubmissionsOpen, false);
  report.checks.push({ at: new Date().toISOString(), phase, active, completed, studentsWithExactlyOneTeam: expectedMemberships, capacityCounters: 'correct', uploadReservations: 0 });
}

try {
  fixture = await seedFixture(models, { sessionCount: 75, otherStudentCount: activeCount * 2, createViva: false });
  if (largeFixture) {
    const password = (await models.User.findById(fixture.admins[0].id).select('+password').lean()).password;
    const dormant = await models.User.insertMany(Array.from({ length: 5077 }, (_, index) => ({
      name: `Dormant local user ${index + 1}`, rollNo: `DORMANT-${index + 1}`, email: `dormant-${index + 1}@example.test`,
      password, role: index < 4650 ? 'student' : 'supervisor', program: index < 4650 ? 'BSCS' : undefined,
      batch: index < 4650 ? 'Fall 2026' : undefined, notificationsEnabled: false,
    })));
    await models.Project.insertMany(Array.from({ length: 2325 }, (_, index) => ({
      members: [dormant[index * 2]._id, dormant[index * 2 + 1]._id], supervisorId: dormant[4650 + index % 427]._id,
      inviteCode: `DORMANT${index + 1}`, title: `Dormant local project ${index + 1}`,
    })));
  }
  for (const file of ['RateLimit', 'VoiceNote', 'StorageDeletionOutbox', 'UploadReservation', 'PortalActivityLog']) {
    const imported = await importTypeScriptModuleWithDependencies(`models/${file}.ts`);
    await imported.default.init();
  }
  await models.SystemConfig.create({ configKey: 'storage', usedBytes: 0, reservedBytes: 0 });
  for (const supervisor of await models.User.find({ role: 'supervisor' })) {
    supervisor.occupiedSlots = await models.Project.countDocuments({ supervisorId: supervisor._id });
    supervisor.extraSlots = 10;
    await supervisor.save();
  }
  const { http: admin } = await authenticate(fixture.admins[0]);
  const round = await call(admin, '/api/admin/viva', 'POST', {
    name: 'Strict local 75-session mixed traffic round', targetPanelSize: 2, minimumPanelSize: 2, vivaDurationMinutes: 30,
    projectIds: fixture.projectIds, examinerIds: [...fixture.panelAdmins, ...fixture.panelMembers].map((user) => user.id),
  }, 'create-round', [201]);
  fixture.roundId = round.round.id;
  const savedPanels = await call(admin, '/api/admin/viva', 'PATCH', {
    roundId: fixture.roundId, panelRevision: round.round.panelRevision,
    panels: fixture.panelAdmins.map((user, index) => ({ examinerIds: [user.id, fixture.panelMembers[index].id], panelAdminId: user.id })),
  }, 'save-panels');
  const scheduledAt = new Date(Date.now() - 60_000).toISOString();
  const savedSchedule = await call(admin, '/api/admin/viva', 'PATCH', {
    action: 'apply-automatic-schedule', roundId: fixture.roundId,
    panelRooms: savedPanels.panels.map((panel, index) => ({ panelId: panel.id, locationLabel: `Strict Lab ${index + 1}` })),
    schedules: savedPanels.panels.map((panel, index) => ({ projectId: fixture.projectIds[index], panelId: panel.id,
      scheduledAt, locationLabel: `Strict Lab ${index + 1}` })),
  }, 'schedule-75', [201]);
  fixture.sessions = savedPanels.panels.map((panel) => savedSchedule.schedules.find((session) => session.panelId === panel.id).id);
  await call(admin, '/api/admin/viva', 'PATCH', { action: 'confirm-round', roundId: fixture.roundId }, 'confirm-round');
  await call(admin, '/api/admin/project-reviews', 'PATCH', { projectSubmissionsOpen: false }, 'disable-pdf-submissions');
  const anchors = await models.Project.find({ _id: { $in: fixture.unrelatedProjects.slice(activeCount) } }).lean();
  const anchorByStudent = new Map(anchors.map((project) => [String(project.members[0]), project]));
  const actors = await Promise.all(fixture.otherStudents.slice(0, activeCount).map((user) => authenticate(user)));
  const panelActors = await Promise.all(fixture.panelAdmins.slice(0, activeCount).map((user) => authenticate(user)));
  const restrictedStudent = await authenticate(fixture.vivaStudents[0]);
  for (const { http } of actors.slice(0, 3)) {
    const rejected = await call(http, '/api/upload', 'POST', { filename: 'blocked.pdf', contentType: 'application/pdf', fileSize: 100,
      idempotencyKey: 'strict-blocked-upload' }, 'blocked-pdf', [403]);
    assert.equal(rejected.code, 'PROJECT_SUBMISSIONS_CLOSED');
  }
  report.setupMetrics = metrics.summary(); metrics.reset();
  assert.equal(await models.User.countDocuments(), report.workload.databaseUsers);
  assert.equal(await models.Project.countDocuments(), report.workload.databaseProjects);
  phase = 'baseline-logins';
  await Promise.all(fixture.otherStudents.slice(0, activeCount).map((user) => authenticate(user)));
  phase = 'concurrent-starts';
  const sessions = await Promise.all(panelActors.map(async (actor, index) => {
    const started = await call(actor.http, '/api/dashboard/supervisor/viva', 'POST',
      { action: 'start', sessionId: fixture.sessions[index] }, 'start-viva');
    assert.equal(started.session.phase, 'running');
    return { ...actor, session: started.session, grades: 0 };
  }));
  await assertState(activeCount);
  phase = 'mixed-traffic';
  const began = Date.now(); const deadline = began + durationSeconds * 1000;
  console.log(JSON.stringify({ event: 'mixed-traffic-started', durationSeconds, scheduled: 75, active: activeCount }));
  const tasks = [
    runLoop(deadline, 5000, async () => Promise.all([
      ...panelActors.map(({ http }) => call(http, '/api/dashboard/supervisor/viva', 'GET', undefined, 'viva-dashboard')),
      ...actors.map(({ http }) => call(http, '/api/dashboard/student', 'GET', undefined, 'student-dashboard')),
      call(admin, '/api/admin/viva', 'GET', undefined, 'admin-viva-dashboard'),
    ])),
    runLoop(deadline, 15000, async (wave) => {
      const count = loginWave[wave % 2 ? 0 : 1]; const started = Date.now();
      const results = await Promise.all(fixture.otherStudents.slice(0, count).map((user) => attempt(() => authenticate(user))));
      const successful = results.filter(Boolean).length;
      report.loginWaves.push({ wave, count, successful, durationMs: Date.now() - started });
      console.log(JSON.stringify({ event: 'login-wave', wave, count, successful, elapsedSeconds: Math.round((Date.now() - began) / 1000) }));
      assert.equal(successful, count);
    }),
    runLoop(deadline, 10000, async (cycle) => Promise.all(sessions.map(async (actor, index) => {
      const saved = await call(actor.http, '/api/dashboard/supervisor/viva', 'POST', {
        action: 'save-grade', sessionId: actor.session.id, version: actor.session.version, grade: cycle % 2 ? 'A' : 'A+',
      }, 'save-grade');
      actor.session = saved.session; actor.grades += 1;
      if (index < 5 && cycle === 0) await call(actor.http, '/api/dashboard/supervisor/viva', 'POST', {
        action: 'save-grade', sessionId: actor.session.id, version: actor.session.version - 1, grade: 'F',
      }, 'stale-grade-rejected', [409]);
    }))),
    ...actors.map((actor, index) => runLoop(deadline, 2000, async (cycle) => {
      if (cycle === 0) {
        await studentAction(actor.http, 'updateName', { name: `Strict Student ${index + 1}` });
        await studentAction(actor.http, 'updateProgramBatch', { id: actor.user.id, batch: 'Spring 2026' });
      }
      const anchor = anchorByStudent.get(fixture.otherStudents[index + activeCount].id);
      await call(actor.http, '/api/project/join', 'POST', { inviteCode: anchor.inviteCode }, 'join-team');
      await studentAction(actor.http, 'resetProject');
      await call(actor.http, '/api/project/leave', 'POST', {}, 'leave-team');
    })),
    runLoop(deadline, 30000, () => assertState(activeCount, 0, false)),
  ];
  await Promise.all(tasks);
  report.mixedElapsedSeconds = (Date.now() - began) / 1000;
  report.phases.push({ phase, loopCycles: await Promise.all(tasks), elapsedSeconds: report.mixedElapsedSeconds });
  await assertState(activeCount);
  phase = 'contention-checks';
  const nameRace = await Promise.all(['Concurrent A', 'Concurrent B'].map((name) => studentAction(actors[0].http, 'updateName', { name }, [429])));
  assert.equal(nameRace.length, 2, 'Name cooldown was bypassed.');
  const target = anchorByStudent.get(fixture.otherStudents[activeCount].id);
  const competingJoins = await Promise.all(actors.slice(0, 10).map(({ http }) => call(http, '/api/project/join', 'POST',
    { inviteCode: target.inviteCode }, 'competing-join', [200, 409])));
  const afterRace = await models.Project.findById(target._id).lean();
  assert.equal(afterRace.members.length, 2, 'Competing joins overfilled a team.');
  assert.equal(competingJoins.filter((body) => body.message).length, 1, 'Exactly one join should win.');
  for (const actor of actors.slice(0, 10)) {
    if (afterRace.members.some((member) => String(member) === actor.user.id)) {
      await call(actor.http, '/api/project/leave', 'POST', {}, 'leave-after-contention');
    }
  }
  await studentAction(restrictedStudent.http, 'updateName', { name: 'Forbidden' }, [401]);
  const restrictedLogin = await client().loginAttempt({ rollNo: fixture.vivaStudents[0].rollNo, labels: { phase, actionName: 'restricted-login' } });
  assert.equal(restrictedLogin.authenticated, false);
  for (const actor of actors) {
    const student = await models.User.findById(actor.user.id).lean();
    assert.equal(student.name, `Strict Student ${actors.indexOf(actor) + 1}`);
    assert.equal(student.batch, 'Spring 2026');
    const project = await models.Project.findOne({ members: actor.user.id }).lean();
    assert.equal(project.members.length, 1);
    assert.equal(project.supervisorId, null);
    assert.equal(project.status, 'Pending');
    assert.equal(project.stage, 'PROPOSAL');
  }
  phase = 'complete-vivas';
  await Promise.all(sessions.map((actor) => call(actor.http, '/api/dashboard/supervisor/viva', 'POST', {
    action: 'complete', sessionId: actor.session.id, version: actor.session.version,
  }, 'complete-viva')));
  await assertState(0, activeCount);
  const auditedGrades = await models.VivaAuditEvent.countDocuments({ roundId: fixture.roundId, event: 'grade-recorded' });
  report.gradeSaves = sessions.reduce((sum, actor) => sum + actor.grades, 0);
  report.gradeAuditCount = auditedGrades;
  assert.equal(auditedGrades, report.gradeSaves, 'Accepted grade saves must each have an audit event.');
  const completed = await models.VivaSession.find({ roundId: fixture.roundId, completedAt: { $type: 'date' } }).lean();
  assert.ok(completed.every((session) => ['A', 'A+'].includes(session.result?.grade)), 'A stale grade overwrote a valid grade.');
  report.status = report.failures.length ? 'failed' : 'passed';
} catch (error) { recordFailure(error); report.status = 'failed'; }
finally {
  stop = true;
  report.endedAt = new Date().toISOString();
  report.metrics = metrics.summary();
  report.unexpectedHttpResponses = report.metrics.reduce((sum, metric) => sum + metric.unexpected, 0);
  if (report.unexpectedHttpResponses) report.status = 'failed';
  report.environment = await collectRunEnvironment().catch((error) => ({ error: String(error) }));
  report.databaseRetained = process.env.VIVA_STRESS_KEEP_DB === '1';
  await mkdir(reportDir, { recursive: true });
  const path = `${reportDir}/mixed-${report.startedAt.replace(/[:.]/g, '-')}.json`;
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, path, failures: report.failures, unexpectedHttpResponses: report.unexpectedHttpResponses }));
  if (mongoose.connection.readyState) {
    if (!report.databaseRetained) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
if (report.status !== 'passed') process.exitCode = 1;
