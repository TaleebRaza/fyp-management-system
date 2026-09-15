import assert from 'node:assert/strict';

import mongoose from 'mongoose';

import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';

const [
  { default: User },
  { default: Project },
  { default: VivaRound },
  { default: VivaPanel },
  { default: VivaSession },
  { default: VivaAuditEvent },
  { cancelVivaSession, scheduleVivaSession },
  { completeVivaSession, saveVivaGrade, startVivaSession },
  {
    getPublishedVivaResultsForStudent,
    getVivaAssessments,
    parseVivaPublicationInput,
    publishVivaResults,
  },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaSessionDashboard.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaPublication.ts'),
]);

function actor(user) {
  return { id: String(user._id), name: user.name, rollNo: user.rollNo };
}

function scheduleInput(roundId, projectId, panelId, scheduledAt) {
  return {
    roundId,
    projectId,
    panelId,
    scheduledAt: new Date(scheduledAt),
    locationLabel: 'Viva Lab',
  };
}

async function completeSession(sessionId, panelAdmin, startedAt, grade) {
  const started = await startVivaSession(sessionId, actor(panelAdmin), new Date(startedAt));
  assert.equal(started.success, true, started.success ? '' : started.error);

  const saved = await saveVivaGrade(
    sessionId,
    started.workspace.version,
    grade,
    actor(panelAdmin),
    new Date(new Date(startedAt).getTime() + 60_000)
  );
  assert.equal(saved.success, true, saved.success ? '' : saved.error);

  const completed = await completeVivaSession(
    sessionId,
    saved.workspace.version,
    actor(panelAdmin),
    new Date(new Date(startedAt).getTime() + 2 * 60_000)
  );
  assert.equal(completed.success, true, completed.success ? '' : completed.error);
}

export async function runVivaPublicationIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m11_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m11_test.');
  }

  try {
    await mongoose.connect(testDatabaseUri);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.init(),
      Project.init(),
      VivaRound.init(),
      VivaPanel.init(),
      VivaSession.init(),
      VivaAuditEvent.init(),
    ]);

    const [systemAdmin, panelAdmin, panelMember, projectSupervisor, studentOne, studentTwo, studentThree, studentFour] = await User.create([
      { name: 'System Admin', email: 'admin.publication@example.test', rollNo: 'A26-0001', password: 'not-a-real-password', role: 'admin' },
      { name: 'Panel Admin', email: 'panel.admin.publication@example.test', rollNo: 'E26-0001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Panel Member', email: 'panel.member.publication@example.test', rollNo: 'E26-0002', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Project Supervisor', email: 'project.supervisor.publication@example.test', rollNo: 'E26-0003', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student One', email: 'student.one.publication@example.test', rollNo: 'F26-0001', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Two', email: 'student.two.publication@example.test', rollNo: 'F26-0002', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Three', email: 'student.three.publication@example.test', rollNo: 'F26-0003', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Four', email: 'student.four.publication@example.test', rollNo: 'F26-0004', password: 'not-a-real-password', role: 'student' },
    ]);
    const [teamOne, teamTwo, cancelledTeam] = await Project.create([
      { supervisorId: projectSupervisor._id, members: [studentOne._id, studentTwo._id], inviteCode: 'VIVA1101', title: 'Snapshot team' },
      { supervisorId: projectSupervisor._id, members: [studentThree._id], inviteCode: 'VIVA1102', title: 'Bulk publication team' },
      { supervisorId: projectSupervisor._id, members: [studentFour._id], inviteCode: 'VIVA1103', title: 'Cancelled team' },
    ]);
    const round = await VivaRound.create({
      name: 'Publication Viva',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: [teamOne._id, teamTwo._id, cancelledTeam._id],
      examinerIds: [panelAdmin._id, panelMember._id],
    });
    const panel = await VivaPanel.create({
      roundId: round._id,
      examinerIds: [panelAdmin._id, panelMember._id],
      panelAdminId: panelAdmin._id,
    });

    assert.equal(parseVivaPublicationInput({ sessionIds: [] }).success, false);
    assert.equal(parseVivaPublicationInput({ sessionIds: [String(panel._id), String(panel._id)] }).success, false);

    const firstSession = await scheduleVivaSession(
      scheduleInput(String(round._id), String(teamOne._id), String(panel._id), '2026-10-10T09:00:00.000Z'),
      actor(systemAdmin)
    );
    const secondSession = await scheduleVivaSession(
      scheduleInput(String(round._id), String(teamTwo._id), String(panel._id), '2026-10-10T10:00:00.000Z'),
      actor(systemAdmin)
    );
    const cancelledSession = await scheduleVivaSession(
      scheduleInput(String(round._id), String(cancelledTeam._id), String(panel._id), '2026-10-10T11:00:00.000Z'),
      actor(systemAdmin)
    );
    assert.equal(firstSession.success, true, firstSession.success ? '' : firstSession.error);
    assert.equal(secondSession.success, true, secondSession.success ? '' : secondSession.error);
    assert.equal(cancelledSession.success, true, cancelledSession.success ? '' : cancelledSession.error);

    await completeSession(firstSession.schedule.id, panelAdmin, '2026-10-10T09:00:00.000Z', 'A');
    await completeSession(secondSession.schedule.id, panelAdmin, '2026-10-10T10:00:00.000Z', 'C');
    const cancelled = await cancelVivaSession(
      {
        sessionId: cancelledSession.schedule.id,
        version: cancelledSession.schedule.version,
        cancellationReason: 'Venue closure',
      },
      actor(systemAdmin),
      new Date('2026-10-10T10:30:00.000Z')
    );
    assert.equal(cancelled.success, true, cancelled.success ? '' : cancelled.error);

    assert.deepEqual(await getPublishedVivaResultsForStudent(String(studentOne._id)), []);
    assert.deepEqual(await getPublishedVivaResultsForStudent(String(studentTwo._id)), []);
    const beforePublication = await getVivaAssessments();
    assert.equal(beforePublication.length, 2);
    assert.equal(beforePublication.find((assessment) => assessment.id === firstSession.schedule.id)?.panel.admin.id, String(panelAdmin._id));
    assert.equal(beforePublication.find((assessment) => assessment.id === firstSession.schedule.id)?.project.members.length, 2);

    const individualPublication = await publishVivaResults(
      { sessionIds: [firstSession.schedule.id] },
      actor(systemAdmin),
      new Date('2026-10-10T12:00:00.000Z')
    );
    assert.equal(individualPublication.published.length, 1);
    assert.equal(individualPublication.published[0].result.grade, 'A');
    assert.equal(individualPublication.published[0].result.percentage, 90);
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: firstSession.schedule.id, event: 'result-published' }), 1);

    const firstStudentResults = await getPublishedVivaResultsForStudent(String(studentOne._id));
    const secondStudentResults = await getPublishedVivaResultsForStudent(String(studentTwo._id));
    assert.deepEqual(firstStudentResults, secondStudentResults);
    assert.deepEqual(firstStudentResults.map(({ grade, percentage }) => ({ grade, percentage })), [{ grade: 'A', percentage: 90 }]);
    assert.deepEqual(await getPublishedVivaResultsForStudent(String(studentThree._id)), []);

    await Project.updateOne({ _id: teamOne._id }, { $set: { members: [studentThree._id] } });
    assert.equal((await getPublishedVivaResultsForStudent(String(studentOne._id))).length, 1);
    assert.equal((await getPublishedVivaResultsForStudent(String(studentThree._id))).length, 0);

    const bulkPublication = await publishVivaResults(
      { sessionIds: [secondSession.schedule.id, cancelledSession.schedule.id] },
      actor(systemAdmin),
      new Date('2026-10-10T12:05:00.000Z')
    );
    assert.equal(bulkPublication.published.length, 1);
    assert.equal(bulkPublication.published[0].result.grade, 'C');
    assert.equal(bulkPublication.published[0].result.percentage, 70);
    assert.equal(bulkPublication.failures.length, 1);
    assert.match(bulkPublication.failures[0].error, /cancelled/);

    assert.deepEqual(
      (await getPublishedVivaResultsForStudent(String(studentThree._id))).map(({ grade, percentage }) => ({ grade, percentage })),
      [{ grade: 'C', percentage: 70 }]
    );
    const repeatedPublication = await publishVivaResults(
      { sessionIds: [firstSession.schedule.id] },
      actor(systemAdmin),
      new Date('2026-10-10T12:10:00.000Z')
    );
    assert.equal(repeatedPublication.published.length, 0);
    assert.equal(repeatedPublication.alreadyPublished.length, 1);
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: firstSession.schedule.id, event: 'result-published' }), 1);

    const assessments = await getVivaAssessments();
    assert.equal(assessments.length, 2);
    assert.ok(assessments.every((assessment) => assessment.publishedAt));

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 8,
      seededTeams: 3,
      verified: ['unpublished-privacy', 'individual-publication', 'bulk-partial-failure', 'canonical-grade-percentage', 'snapshot-team-history', 'same-team-result', 'repeat-publication', 'audit-history'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
