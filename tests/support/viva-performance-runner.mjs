import assert from 'node:assert/strict';

import mongoose from 'mongoose';

import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';

const [
  { default: User },
  { default: Project },
  { default: VivaRound },
  { default: VivaPanel },
  { default: VivaSession },
  { default: VivaParticipantLock },
  { default: VivaAuditEvent },
  { completeVivaSession, getVivaPanelSessions, saveVivaGrade, startVivaSession },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaParticipantLock.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaSessionDashboard.ts'),
]);

const SESSION_COUNT = 50;

function actor(user) {
  return { id: String(user._id), name: user.name, rollNo: user.rollNo };
}

function percentile(values, percentage) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentage) - 1)];
}

async function timedAll(tasks) {
  const durations = [];
  const results = await Promise.allSettled(tasks.map(async (task) => {
    const startedAt = process.hrtime.bigint();
    try {
      return await task();
    } finally {
      durations.push(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
    }
  }));
  return {
    results,
    metrics: {
      min: Math.min(...durations),
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: Math.max(...durations),
    },
  };
}

async function measureAgenda(actorId) {
  let reads = 0;
  mongoose.set('debug', (_collection, method) => {
    if (method === 'find' || method === 'findOne') reads += 1;
  });
  const startedAt = process.hrtime.bigint();
  const sessions = await getVivaPanelSessions(actorId);
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  mongoose.set('debug', false);
  return { count: sessions.length, reads, durationMs, bytes: Buffer.byteLength(JSON.stringify(sessions)) };
}

async function measureLegacyAgenda(actorId) {
  let reads = 0;
  mongoose.set('debug', (_collection, method) => {
    if (method === 'find' || method === 'findOne') reads += 1;
  });
  const startedAt = process.hrtime.bigint();
  const panels = await VivaPanel.find({ examinerIds: actorId }).select('_id').lean();
  const sessions = await VivaSession.find({
    panelId: { $in: panels.map(({ _id }) => _id) },
    cancelledAt: null,
  }).lean();
  await Promise.all(sessions.map(async (session) => {
    const [round, panel, project] = await Promise.all([
      VivaRound.findById(session.roundId).lean(),
      VivaPanel.findById(session.panelId).lean(),
      Project.findById(session.projectId).lean(),
    ]);
    const participantIds = [
      ...(panel?.examinerIds || []),
      ...(project?.members || []),
      ...(project?.supervisorId ? [project.supervisorId] : []),
    ];
    await User.find({ _id: { $in: participantIds } }).lean();
    assert.ok(round && panel && project);
  }));
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
  mongoose.set('debug', false);
  return { count: sessions.length, reads, durationMs };
}

export async function runVivaPerformanceIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m14_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m14_test.');
  }

  try {
    await mongoose.connect(testDatabaseUri, { maxPoolSize: 10, minPoolSize: 1 });
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.init(),
      Project.init(),
      VivaRound.init(),
      VivaPanel.init(),
      VivaSession.init(),
      VivaParticipantLock.init(),
      VivaAuditEvent.init(),
    ]);

    const users = await User.create([
      { name: 'Shared Project Supervisor', email: 'project.supervisor.performance@example.test', rollNo: 'E26-9000', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Agenda Admin', email: 'agenda.admin.performance@example.test', rollNo: 'E26-9001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Agenda Member', email: 'agenda.member.performance@example.test', rollNo: 'E26-9002', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Agenda Student One', email: 'agenda.student.1@example.test', rollNo: 'F26-9001', password: 'not-a-real-password', role: 'student', batch: 'Fall 2024' },
      { name: 'Agenda Student Two', email: 'agenda.student.2@example.test', rollNo: 'F26-9002', password: 'not-a-real-password', role: 'student', batch: 'Spring 2025' },
      ...Array.from({ length: SESSION_COUNT * 2 }, (_, index) => ({
        name: `Performance Examiner ${index + 1}`,
        email: `performance.examiner.${index + 1}@example.test`,
        rollNo: `E27-${String(index + 1).padStart(4, '0')}`,
        password: 'not-a-real-password',
        role: 'supervisor',
      })),
      ...Array.from({ length: SESSION_COUNT * 2 }, (_, index) => ({
        name: `Performance Student ${index + 1}`,
        email: `performance.student.${index + 1}@example.test`,
        rollNo: `F27-${String(index + 1).padStart(4, '0')}`,
        password: 'not-a-real-password',
        role: 'student',
        batch: index < 2 ? ['Fall 2024', 'Spring 2025'][index] : 'Fall 2024',
      })),
    ]);
    const [projectSupervisor, agendaAdmin, agendaMember, agendaStudentOne, agendaStudentTwo] = users;
    const examiners = users.slice(5, 5 + SESSION_COUNT * 2);
    const students = users.slice(5 + SESSION_COUNT * 2);

    const agendaRound = await VivaRound.create({
      name: 'Agenda query benchmark',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      confirmedAt: new Date('2026-10-11T07:00:00.000Z'),
      examinerIds: [agendaAdmin._id, agendaMember._id],
    });
    const agendaPanel = await VivaPanel.create({
      roundId: agendaRound._id,
      examinerIds: [agendaAdmin._id, agendaMember._id],
      panelAdminId: agendaAdmin._id,
      locationLabel: 'Agenda Lab',
    });
    const agendaProjects = await Project.create(Array.from({ length: SESSION_COUNT }, (_, index) => ({
      supervisorId: projectSupervisor._id,
      members: [agendaStudentOne._id, agendaStudentTwo._id],
      inviteCode: `AGENDA${String(index + 1).padStart(3, '0')}`,
      title: `Agenda project ${index + 1}`,
    })));

    const agendaMeasurements = [];
    let createdAgendaSessions = 0;
    for (const target of [1, 10, 50]) {
      const additions = agendaProjects.slice(createdAgendaSessions, target).map((project, index) => ({
        roundId: agendaRound._id,
        panelId: agendaPanel._id,
        projectId: project._id,
        scheduledAt: new Date(Date.UTC(2026, 9, 11, 8, createdAgendaSessions + index)),
        vivaEndsAt: new Date(Date.UTC(2026, 9, 11, 8, createdAgendaSessions + index + 30)),
        locationLabel: 'Agenda Lab',
      }));
      await VivaSession.insertMany(additions);
      createdAgendaSessions = target;
      const legacyMeasurement = await measureLegacyAgenda(String(agendaAdmin._id));
      const measurement = await measureAgenda(String(agendaAdmin._id));
      assert.equal(measurement.count, target);
      assert.equal(measurement.reads, 5);
      assert.equal(legacyMeasurement.reads, 2 + target * 4);
      agendaMeasurements.push({
        sessions: target,
        beforeReads: legacyMeasurement.reads,
        afterReads: measurement.reads,
        beforeMs: legacyMeasurement.durationMs,
        afterMs: measurement.durationMs,
        bytes: measurement.bytes,
      });
    }

    const throughputProjects = await Project.create(Array.from({ length: SESSION_COUNT }, (_, index) => ({
      supervisorId: projectSupervisor._id,
      members: [students[index * 2]._id, students[index * 2 + 1]._id],
      inviteCode: `LOAD${String(index + 1).padStart(3, '0')}`,
      title: `Concurrent project ${index + 1}`,
    })));
    const throughputRounds = await VivaRound.create(Array.from({ length: SESSION_COUNT }, (_, index) => ({
      name: `Concurrent Viva ${index + 1}`,
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: [throughputProjects[index]._id],
      examinerIds: [examiners[index * 2]._id, examiners[index * 2 + 1]._id],
      confirmedAt: new Date('2026-10-12T09:00:00.000Z'),
    })));
    const throughputPanels = await VivaPanel.create(Array.from({ length: SESSION_COUNT }, (_, index) => ({
      roundId: throughputRounds[index]._id,
      examinerIds: [examiners[index * 2]._id, examiners[index * 2 + 1]._id],
      panelAdminId: examiners[index * 2]._id,
      locationLabel: `Lab ${index + 1}`,
    })));
    const throughputSessions = await VivaSession.create(Array.from({ length: SESSION_COUNT }, (_, index) => ({
      roundId: throughputRounds[index]._id,
      panelId: throughputPanels[index]._id,
      projectId: throughputProjects[index]._id,
      scheduledAt: new Date('2026-10-12T09:00:00.000Z'),
      vivaEndsAt: new Date('2026-10-12T09:30:00.000Z'),
      locationLabel: `Lab ${index + 1}`,
    })));
    const participantIds = [...examiners, ...students].map(({ _id }) => _id);
    const timestampsBeforeStart = new Map(
      (await User.find({ _id: { $in: participantIds } }).select('_id updatedAt').lean())
        .map((user) => [String(user._id), user.updatedAt.getTime()])
    );

    const starts = await timedAll(throughputSessions.map((session, index) => async () => (
      startVivaSession(String(session._id), actor(examiners[index * 2]), new Date('2026-10-12T09:00:00.000Z'))
    )));
    assert.ok(starts.results.every((result) => result.status === 'fulfilled' && result.value.success && result.value.started));
    assert.equal(await VivaParticipantLock.countDocuments(), SESSION_COUNT * 4);
    const timestampsAfterStart = await User.find({ _id: { $in: participantIds } }).select('_id updatedAt').lean();
    assert.ok(timestampsAfterStart.every((user) => timestampsBeforeStart.get(String(user._id)) === user.updatedAt.getTime()));
    const [panelExplain, sessionExplain, lockExplain] = await Promise.all([
      VivaPanel.find({ examinerIds: agendaAdmin._id }).explain('executionStats'),
      VivaSession.find({ panelId: agendaPanel._id, cancelledAt: null })
        .sort({ scheduledAt: 1, _id: 1 })
        .explain('executionStats'),
      VivaParticipantLock.find({ userId: examiners[1]._id, restrictPortal: true })
        .explain('executionStats'),
    ]);
    assert.match(JSON.stringify(panelExplain.queryPlanner.winningPlan), /examinerIds_1/);
    assert.match(JSON.stringify(sessionExplain.queryPlanner.winningPlan), /panelId_1_cancelledAt_1_scheduledAt_1__id_1/);
    assert.match(JSON.stringify(lockExplain.queryPlanner.winningPlan), /userId_1/);
    assert.equal(lockExplain.executionStats.totalDocsExamined, 1);

    const startedWorkspaces = starts.results.map((result) => result.value.workspace);
    const grades = await timedAll(throughputSessions.map((session, index) => async () => (
      saveVivaGrade(String(session._id), startedWorkspaces[index].version, 'A', actor(examiners[index * 2]))
    )));
    assert.ok(grades.results.every((result) => result.status === 'fulfilled' && result.value.success));

    const gradedWorkspaces = grades.results.map((result) => result.value.workspace);
    const completions = await timedAll(throughputSessions.map((session, index) => async () => (
      completeVivaSession(String(session._id), gradedWorkspaces[index].version, actor(examiners[index * 2]))
    )));
    assert.ok(completions.results.every((result) => result.status === 'fulfilled' && result.value.success));
    assert.equal(await VivaParticipantLock.countDocuments(), 0);
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: { $in: throughputSessions.map(({ _id }) => _id) } }), SESSION_COUNT * 3);

    const sharedRound = await VivaRound.create({
      name: 'Shared round concurrency benchmark',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: throughputProjects.map(({ _id }) => _id),
      examinerIds: examiners.map(({ _id }) => _id),
      confirmedAt: new Date('2026-10-12T10:00:00.000Z'),
    });
    const sharedRoundPanels = await VivaPanel.create(Array.from({ length: SESSION_COUNT }, (_, index) => ({
      roundId: sharedRound._id,
      examinerIds: [examiners[index * 2]._id, examiners[index * 2 + 1]._id],
      panelAdminId: examiners[index * 2]._id,
      locationLabel: `Shared Round Lab ${index + 1}`,
    })));
    const sharedRoundSessions = await VivaSession.create(Array.from({ length: SESSION_COUNT }, (_, index) => ({
      roundId: sharedRound._id,
      panelId: sharedRoundPanels[index]._id,
      projectId: throughputProjects[index]._id,
      scheduledAt: new Date('2026-10-12T10:00:00.000Z'),
      vivaEndsAt: new Date('2026-10-12T10:30:00.000Z'),
      locationLabel: `Shared Round Lab ${index + 1}`,
    })));

    const sharedRoundStarts = await timedAll(sharedRoundSessions.map((session, index) => async () => (
      startVivaSession(String(session._id), actor(examiners[index * 2]), new Date('2026-10-12T10:00:00.000Z'))
    )));
    assert.equal(sharedRoundStarts.results.filter((result) => (
      result.status === 'fulfilled' && result.value.success && result.value.started
    )).length, SESSION_COUNT);
    assert.equal(sharedRoundStarts.results.filter((result) => (
      result.status === 'rejected' || !result.value.success
    )).length, 0);
    assert.equal(await VivaSession.countDocuments({
      _id: { $in: sharedRoundSessions.map(({ _id }) => _id) },
      startedAt: { $type: 'date' },
    }), SESSION_COUNT);
    const sharedRoundLocks = await VivaParticipantLock.find({
      sessionId: { $in: sharedRoundSessions.map(({ _id }) => _id) },
    }).select('userId').lean();
    assert.equal(sharedRoundLocks.length, SESSION_COUNT * 4);
    assert.equal(new Set(sharedRoundLocks.map(({ userId }) => String(userId))).size, SESSION_COUNT * 4);
    assert.equal(await VivaAuditEvent.countDocuments({
      sessionId: { $in: sharedRoundSessions.map(({ _id }) => _id) },
      event: 'session-started',
    }), SESSION_COUNT);
    assert.ok(sharedRoundStarts.metrics.p95 <= 5_000, `Shared-round start p95 was ${sharedRoundStarts.metrics.p95}ms`);

    const sharedRoundWorkspaces = sharedRoundStarts.results.map((result) => result.value.workspace);
    const sharedRoundGrades = await timedAll(sharedRoundSessions.map((session, index) => async () => (
      saveVivaGrade(String(session._id), sharedRoundWorkspaces[index].version, 'A', actor(examiners[index * 2]))
    )));
    assert.ok(sharedRoundGrades.results.every((result) => result.status === 'fulfilled' && result.value.success));
    assert.ok(sharedRoundGrades.metrics.p95 <= 5_000, `Shared-round grade p95 was ${sharedRoundGrades.metrics.p95}ms`);
    const sharedRoundGradedWorkspaces = sharedRoundGrades.results.map((result) => result.value.workspace);
    const sharedRoundCompletions = await timedAll(sharedRoundSessions.map((session, index) => async () => (
      completeVivaSession(String(session._id), sharedRoundGradedWorkspaces[index].version, actor(examiners[index * 2]))
    )));
    assert.ok(sharedRoundCompletions.results.every((result) => result.status === 'fulfilled' && result.value.success));
    assert.ok(sharedRoundCompletions.metrics.p95 <= 5_000, `Shared-round completion p95 was ${sharedRoundCompletions.metrics.p95}ms`);
    assert.equal(await VivaParticipantLock.countDocuments({
      sessionId: { $in: sharedRoundSessions.map(({ _id }) => _id) },
    }), 0);
    assert.equal(await VivaAuditEvent.countDocuments({
      sessionId: { $in: sharedRoundSessions.map(({ _id }) => _id) },
    }), SESSION_COUNT * 3);
    assert.equal(await VivaSession.countDocuments({
      _id: { $in: sharedRoundSessions.map(({ _id }) => _id) },
      completedAt: { $type: 'date' },
      version: 2,
    }), SESSION_COUNT);

    await VivaPanel.updateOne(
      { _id: throughputPanels[1]._id },
      { $set: { examinerIds: [examiners[2]._id, examiners[0]._id] } }
    );
    const [sharedExaminerSessionOne, sharedExaminerSessionTwo] = await VivaSession.create([
      {
        roundId: throughputRounds[0]._id,
        panelId: throughputPanels[0]._id,
        projectId: agendaProjects[0]._id,
        scheduledAt: new Date('2026-10-13T09:00:00.000Z'),
        vivaEndsAt: new Date('2026-10-13T09:30:00.000Z'),
        locationLabel: 'Conflict Lab',
      },
      {
        roundId: throughputRounds[1]._id,
        panelId: throughputPanels[1]._id,
        projectId: throughputProjects[0]._id,
        scheduledAt: new Date('2026-10-13T09:00:00.000Z'),
        vivaEndsAt: new Date('2026-10-13T09:30:00.000Z'),
        locationLabel: 'Conflict Lab',
      },
    ]);
    const conflictResults = await Promise.all([
      startVivaSession(String(sharedExaminerSessionOne._id), actor(examiners[0])),
      startVivaSession(String(sharedExaminerSessionTwo._id), actor(examiners[2])),
    ]);
    assert.equal(conflictResults.filter((result) => result.success).length, 1);
    assert.equal(conflictResults.filter((result) => !result.success && /already in an active session/.test(result.error)).length, 1);
    assert.equal(await VivaSession.countDocuments({
      _id: { $in: [sharedExaminerSessionOne._id, sharedExaminerSessionTwo._id] },
      startedAt: { $type: 'date' },
      completedAt: null,
      cancelledAt: null,
    }), 1);
    await VivaParticipantLock.deleteMany({
      sessionId: { $in: [sharedExaminerSessionOne._id, sharedExaminerSessionTwo._id] },
    });

    const studentRaceProjects = await Project.create([
      {
        supervisorId: projectSupervisor._id,
        members: [agendaStudentOne._id, students[10]._id],
        inviteCode: 'STUDENTRACE1',
        title: 'Student conflict one',
      },
      {
        supervisorId: projectSupervisor._id,
        members: [agendaStudentOne._id, students[11]._id],
        inviteCode: 'STUDENTRACE2',
        title: 'Student conflict two',
      },
    ]);
    const studentRaceSessions = await VivaSession.create([
      {
        roundId: throughputRounds[2]._id,
        panelId: throughputPanels[2]._id,
        projectId: studentRaceProjects[0]._id,
        scheduledAt: new Date('2026-10-14T09:00:00.000Z'),
        vivaEndsAt: new Date('2026-10-14T09:30:00.000Z'),
        locationLabel: 'Student Conflict Lab 1',
      },
      {
        roundId: throughputRounds[3]._id,
        panelId: throughputPanels[3]._id,
        projectId: studentRaceProjects[1]._id,
        scheduledAt: new Date('2026-10-14T09:00:00.000Z'),
        vivaEndsAt: new Date('2026-10-14T09:30:00.000Z'),
        locationLabel: 'Student Conflict Lab 2',
      },
    ]);
    const studentConflictResults = await Promise.all([
      startVivaSession(String(studentRaceSessions[0]._id), actor(examiners[4])),
      startVivaSession(String(studentRaceSessions[1]._id), actor(examiners[6])),
    ]);
    assert.equal(studentConflictResults.filter((result) => result.success).length, 1);
    assert.equal(studentConflictResults.filter((result) => !result.success && /already in an active session/.test(result.error)).length, 1);
    assert.equal(await VivaSession.countDocuments({
      _id: { $in: studentRaceSessions.map(({ _id }) => _id) },
      startedAt: { $type: 'date' },
      completedAt: null,
      cancelledAt: null,
    }), 1);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      pool: { maxPoolSize: 10, minPoolSize: 1 },
      agenda: agendaMeasurements,
      concurrentStarts: starts.metrics,
      sharedRoundConcurrentStarts: sharedRoundStarts.metrics,
      sharedRoundConcurrentGrades: sharedRoundGrades.metrics,
      sharedRoundConcurrentCompletions: sharedRoundCompletions.metrics,
      concurrentGrades: grades.metrics,
      concurrentCompletions: completions.metrics,
      successes: SESSION_COUNT,
      staleLocksAfterCompletion: 0,
      mixedBatchProjectStarted: true,
      examinerConflictRace: 'exactly-one-started',
      studentConflictRace: 'exactly-one-started',
      queryPlans: {
        panelDocsExamined: panelExplain.executionStats.totalDocsExamined,
        sessionDocsExamined: sessionExplain.executionStats.totalDocsExamined,
        lockDocsExamined: lockExplain.executionStats.totalDocsExamined,
      },
    }));
  } finally {
    mongoose.set('debug', false);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
