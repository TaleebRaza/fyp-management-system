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
  { cancelVivaSession, getVivaSchedules, parseVivaSessionCancellationInput, scheduleVivaSession },
  { completeVivaSession, saveVivaGrade, startVivaSession },
  { isVivaPanelMemberAccessRestricted },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaSessionDashboard.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaAccessRestriction.ts'),
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

export async function runVivaCancellationIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m10_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m10_test.');
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

    const [systemAdmin, panelAdmin, panelMember, projectSupervisor, studentOne, studentTwo, studentThree] = await User.create([
      { name: 'System Admin', email: 'admin.cancellation@example.test', rollNo: 'A26-0001', password: 'not-a-real-password', role: 'admin' },
      { name: 'Panel Admin', email: 'panel.admin.cancellation@example.test', rollNo: 'E26-0001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Panel Member', email: 'panel.member.cancellation@example.test', rollNo: 'E26-0002', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Project Supervisor', email: 'project.supervisor.cancellation@example.test', rollNo: 'E26-0003', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student One', email: 'student.one.cancellation@example.test', rollNo: 'F26-0001', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Two', email: 'student.two.cancellation@example.test', rollNo: 'F26-0002', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Three', email: 'student.three.cancellation@example.test', rollNo: 'F26-0003', password: 'not-a-real-password', role: 'student' },
    ]);
    const [projectOne, projectTwo, projectThree] = await Project.create([
      { supervisorId: projectSupervisor._id, members: [studentOne._id], inviteCode: 'VIVA1001', title: 'Cancelled scheduled team' },
      { supervisorId: projectSupervisor._id, members: [studentTwo._id], inviteCode: 'VIVA1002', title: 'Cancelled active team' },
      { supervisorId: projectSupervisor._id, members: [studentThree._id], inviteCode: 'VIVA1003', title: 'Cancellation race team' },
    ]);
    const round = await VivaRound.create({
      name: 'Cancellation Viva',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: [projectOne._id, projectTwo._id, projectThree._id],
      examinerIds: [panelAdmin._id, panelMember._id],
    });
    const panel = await VivaPanel.create({
      roundId: round._id,
      examinerIds: [panelAdmin._id, panelMember._id],
      panelAdminId: panelAdmin._id,
      locationLabel: 'Viva Lab',
    });
    const adminActor = actor(systemAdmin);
    const panelAdminActor = actor(panelAdmin);

    assert.equal(
      parseVivaSessionCancellationInput({ sessionId: String(panel._id), version: 0, cancellationReason: ' ' }).success,
      false
    );

    const scheduled = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectOne._id), String(panel._id), '2026-10-10T09:00:00.000Z'),
      adminActor
    );
    assert.equal(scheduled.success, true, scheduled.success ? '' : scheduled.error);

    const missingReason = await cancelVivaSession(
      { sessionId: scheduled.schedule.id, version: scheduled.schedule.version, cancellationReason: ' ' },
      adminActor,
      new Date('2026-10-10T09:01:00.000Z')
    );
    assert.equal(missingReason.success, false);
    assert.equal(missingReason.reason, 'invalid');

    const cancelledScheduled = await cancelVivaSession(
      { sessionId: scheduled.schedule.id, version: scheduled.schedule.version, cancellationReason: 'Room unavailable' },
      adminActor,
      new Date('2026-10-10T09:02:00.000Z')
    );
    assert.equal(cancelledScheduled.success, true, cancelledScheduled.success ? '' : cancelledScheduled.error);
    assert.equal(cancelledScheduled.schedule.phase, 'cancelled');
    assert.equal(cancelledScheduled.schedule.cancellationReason, 'Room unavailable');
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: scheduled.schedule.id, event: 'session-cancelled' }), 1);

    const freshScheduledAttempt = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectOne._id), String(panel._id), '2026-10-10T10:00:00.000Z'),
      adminActor
    );
    assert.equal(freshScheduledAttempt.success, true, freshScheduledAttempt.success ? '' : freshScheduledAttempt.error);
    const freshScheduledRecord = await VivaSession.findById(freshScheduledAttempt.schedule.id).lean();
    assert.equal(freshScheduledRecord.result, undefined);
    assert.equal(freshScheduledRecord.startedAt, null);
    assert.equal(freshScheduledRecord.cancelledAt, null);

    const active = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectTwo._id), String(panel._id), '2026-10-10T11:00:00.000Z'),
      adminActor
    );
    assert.equal(active.success, true, active.success ? '' : active.error);
    const started = await startVivaSession(
      active.schedule.id,
      panelAdminActor,
      new Date('2026-10-10T11:00:00.000Z')
    );
    assert.equal(started.success, true, started.success ? '' : started.error);
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), true);

    const savedGrade = await saveVivaGrade(
      active.schedule.id,
      started.workspace.version,
      'B',
      panelAdminActor,
      new Date('2026-10-10T11:01:00.000Z')
    );
    assert.equal(savedGrade.success, true, savedGrade.success ? '' : savedGrade.error);

    const cancelledActive = await cancelVivaSession(
      { sessionId: active.schedule.id, version: savedGrade.workspace.version, cancellationReason: 'Power outage' },
      adminActor,
      new Date('2026-10-10T11:02:00.000Z')
    );
    assert.equal(cancelledActive.success, true, cancelledActive.success ? '' : cancelledActive.error);
    assert.equal(cancelledActive.schedule.phase, 'cancelled');
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), false);

    const cancelledGradeSave = await saveVivaGrade(
      active.schedule.id,
      savedGrade.workspace.version,
      'A',
      panelAdminActor,
      new Date('2026-10-10T11:03:00.000Z')
    );
    assert.equal(cancelledGradeSave.success, false);
    assert.equal(cancelledGradeSave.reason, 'not-startable');
    const cancelledCompletion = await completeVivaSession(
      active.schedule.id,
      savedGrade.workspace.version,
      panelAdminActor,
      new Date('2026-10-10T11:03:00.000Z')
    );
    assert.equal(cancelledCompletion.success, false);
    assert.equal(cancelledCompletion.reason, 'not-startable');

    const repeatedCancellation = await cancelVivaSession(
      { sessionId: active.schedule.id, version: cancelledActive.schedule.version, cancellationReason: 'Duplicate request' },
      adminActor,
      new Date('2026-10-10T11:03:00.000Z')
    );
    assert.equal(repeatedCancellation.success, false);
    assert.equal(repeatedCancellation.reason, 'not-cancellable');

    const freshActiveAttempt = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectTwo._id), String(panel._id), '2026-10-10T12:00:00.000Z'),
      adminActor
    );
    assert.equal(freshActiveAttempt.success, true, freshActiveAttempt.success ? '' : freshActiveAttempt.error);
    const freshActiveRecord = await VivaSession.findById(freshActiveAttempt.schedule.id).lean();
    assert.equal(freshActiveRecord.result, undefined);

    await VivaSession.updateOne(
      { _id: freshScheduledAttempt.schedule.id },
      { $set: { completedAt: new Date('2026-10-10T10:30:00.000Z') } }
    );
    const completedCancellation = await cancelVivaSession(
      { sessionId: freshScheduledAttempt.schedule.id, version: freshScheduledAttempt.schedule.version, cancellationReason: 'Too late' },
      adminActor,
      new Date('2026-10-10T10:32:00.000Z')
    );
    assert.equal(completedCancellation.success, false);
    assert.equal(completedCancellation.reason, 'not-cancellable');
    assert.match(completedCancellation.error, /completed/);

    const racingSession = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectThree._id), String(panel._id), '2026-10-10T13:00:00.000Z'),
      adminActor
    );
    assert.equal(racingSession.success, true, racingSession.success ? '' : racingSession.error);
    const racingStart = await startVivaSession(
      racingSession.schedule.id,
      panelAdminActor,
      new Date('2026-10-10T13:00:00.000Z')
    );
    assert.equal(racingStart.success, true, racingStart.success ? '' : racingStart.error);

    const cancellationRace = await Promise.all([
      cancelVivaSession(
        { sessionId: racingSession.schedule.id, version: racingStart.workspace.version, cancellationReason: 'Network interruption' },
        adminActor,
        new Date('2026-10-10T13:01:00.000Z')
      ),
      saveVivaGrade(
        racingSession.schedule.id,
        racingStart.workspace.version,
        'A',
        panelAdminActor,
        new Date('2026-10-10T13:01:00.000Z')
      ),
    ]);
    assert.equal(cancellationRace.filter((result) => result.success).length, 1);

    let raceRecord = await VivaSession.findById(racingSession.schedule.id).lean();
    if (!raceRecord.cancelledAt) {
      const followUpCancellation = await cancelVivaSession(
        { sessionId: racingSession.schedule.id, version: raceRecord.version, cancellationReason: 'Network interruption' },
        adminActor,
        new Date('2026-10-10T13:02:00.000Z')
      );
      assert.equal(followUpCancellation.success, true, followUpCancellation.success ? '' : followUpCancellation.error);
      raceRecord = await VivaSession.findById(racingSession.schedule.id).lean();
    }
    assert.ok(raceRecord.cancelledAt);
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: racingSession.schedule.id, event: 'session-cancelled' }), 1);

    const schedules = await getVivaSchedules();
    assert.equal(schedules.find((schedule) => schedule.id === active.schedule.id)?.phase, 'cancelled');
    assert.equal(schedules.find((schedule) => schedule.id === freshActiveAttempt.schedule.id)?.phase, 'scheduled');

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 7,
      seededTeams: 3,
      verified: ['required-reason', 'scheduled-cancellation', 'active-cancellation', 'audit-history', 'restriction-release', 'fresh-attempt', 'no-inherited-grade', 'cancelled-write-rejection', 'completed-result-protection', 'cancellation-grade-race'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
