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
  { getVivaSchedules, rescheduleVivaSession, scheduleVivaSession },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts'),
]);

function scheduleInput(roundId, projectId, panelId, scheduledAt) {
  return {
    roundId,
    projectId,
    panelId,
    scheduledAt: new Date(scheduledAt),
    locationLabel: 'Lab 3',
  };
}

export async function runVivaSchedulingIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m6_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m6_test.');
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

    const [admin, supervisorOne, supervisorTwo, supervisorThree, supervisorFour, supervisorFive, studentOne, studentTwo, studentThree, studentFour, studentFive, studentSix] = await User.create([
      { name: 'Admin Example', email: 'admin.schedule@example.test', rollNo: 'A26-0001', password: 'not-a-real-password', role: 'admin' },
      { name: 'Supervisor One', email: 'supervisor.one@example.test', rollNo: 'E26-0001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Two', email: 'supervisor.two@example.test', rollNo: 'E26-0002', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Three', email: 'supervisor.three@example.test', rollNo: 'E26-0003', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Four', email: 'supervisor.four@example.test', rollNo: 'E26-0004', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Five', email: 'supervisor.five@example.test', rollNo: 'E26-0005', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student One', email: 'student.one@example.test', rollNo: 'F26-0001', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Two', email: 'student.two@example.test', rollNo: 'F26-0002', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Three', email: 'student.three@example.test', rollNo: 'F26-0003', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Four', email: 'student.four@example.test', rollNo: 'F26-0004', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Five', email: 'student.five@example.test', rollNo: 'F26-0005', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Six', email: 'student.six@example.test', rollNo: 'F26-0006', password: 'not-a-real-password', role: 'student' },
    ]);
    const actor = { id: String(admin._id), name: admin.name, rollNo: admin.rollNo };

    const [projectOne, projectTwo, projectThree, projectFour, projectFive, projectSix] = await Project.create([
      { supervisorId: supervisorOne._id, members: [studentOne._id, studentTwo._id], inviteCode: 'SCHED01', title: 'Alpha team' },
      { supervisorId: supervisorTwo._id, members: [studentThree._id], inviteCode: 'SCHED02', title: 'Beta team' },
      { supervisorId: supervisorFive._id, members: [studentOne._id], inviteCode: 'SCHED03', title: 'Shared-student team' },
      { supervisorId: supervisorFive._id, members: [studentFour._id], inviteCode: 'SCHED04', title: 'Delta team' },
      { supervisorId: supervisorFive._id, members: [studentFive._id], inviteCode: 'SCHED05', title: 'Echo team' },
      { supervisorId: supervisorFive._id, members: [studentSix._id], inviteCode: 'SCHED06', title: 'Foxtrot team' },
    ]);
    const round = await VivaRound.create({
      name: 'Scheduling Viva',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: [projectOne._id, projectTwo._id, projectThree._id, projectFour._id, projectFive._id, projectSix._id],
      examinerIds: [supervisorOne._id, supervisorTwo._id, supervisorThree._id, supervisorFour._id, supervisorFive._id],
    });
    const [primaryPanel, secondaryPanel, undersizedPanel] = await VivaPanel.create([
      { roundId: round._id, examinerIds: [supervisorTwo._id, supervisorThree._id], panelAdminId: supervisorTwo._id, locationLabel: 'Lab 3' },
      { roundId: round._id, examinerIds: [supervisorOne._id, supervisorFour._id], panelAdminId: supervisorOne._id, locationLabel: 'Lab 3' },
      { roundId: round._id, examinerIds: [supervisorFive._id], panelAdminId: supervisorFive._id, locationLabel: 'Lab 3' },
    ]);

    const firstSchedule = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectOne._id), String(primaryPanel._id), '2026-10-10T09:00:00.000Z'),
      actor
    );
    assert.equal(firstSchedule.success, true, firstSchedule.success ? '' : firstSchedule.error);
    assert.equal(firstSchedule.schedule.vivaEndsAt, '2026-10-10T09:30:00.000Z');
    assert.equal(await VivaAuditEvent.countDocuments({ event: 'session-scheduled' }), 1);

    const ownSupervisor = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectTwo._id), String(primaryPanel._id), '2026-10-10T10:00:00.000Z'),
      actor
    );
    assert.equal(ownSupervisor.success, true, ownSupervisor.success ? '' : ownSupervisor.error);

    const undersizedPanelResult = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectFour._id), String(undersizedPanel._id), '2026-10-10T10:00:00.000Z'),
      actor
    );
    assert.equal(undersizedPanelResult.success, false);
    assert.match(undersizedPanelResult.error, /cannot conduct/);

    const teacherConflict = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectFour._id), String(primaryPanel._id), '2026-10-10T09:15:00.000Z'),
      actor
    );
    assert.equal(teacherConflict.success, false);
    assert.match(teacherConflict.error, /teacher is already booked/);

    const studentConflict = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectThree._id), String(secondaryPanel._id), '2026-10-10T09:15:00.000Z'),
      actor
    );
    assert.equal(studentConflict.success, false);
    assert.match(studentConflict.error, /team member is already booked/);

    const secondSchedule = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectFour._id), String(secondaryPanel._id), '2026-10-10T10:00:00.000Z'),
      actor
    );
    assert.equal(secondSchedule.success, true, secondSchedule.success ? '' : secondSchedule.error);

    const duplicateAttempt = await scheduleVivaSession(
      scheduleInput(String(round._id), String(projectFour._id), String(secondaryPanel._id), '2026-10-10T11:00:00.000Z'),
      actor
    );
    assert.equal(duplicateAttempt.success, false);
    assert.match(duplicateAttempt.error, /already has a Viva attempt/);

    const rescheduled = await rescheduleVivaSession(
      secondSchedule.schedule.id,
      secondSchedule.schedule.version,
      scheduleInput(String(round._id), String(projectFour._id), String(secondaryPanel._id), '2026-10-10T11:30:00.000Z'),
      actor
    );
    assert.equal(rescheduled.success, true, rescheduled.success ? '' : rescheduled.error);
    assert.equal(rescheduled.schedule.version, 1);
    assert.equal(rescheduled.schedule.vivaEndsAt, '2026-10-10T12:00:00.000Z');

    const staleReschedule = await rescheduleVivaSession(
      secondSchedule.schedule.id,
      secondSchedule.schedule.version,
      scheduleInput(String(round._id), String(projectFour._id), String(secondaryPanel._id), '2026-10-10T12:30:00.000Z'),
      actor
    );
    assert.equal(staleReschedule.success, false);
    assert.equal(staleReschedule.reason, 'concurrent-change');

    await VivaSession.updateOne({ _id: secondSchedule.schedule.id }, { $set: { startedAt: new Date('2026-10-10T11:30:00.000Z') } });
    const startedReschedule = await rescheduleVivaSession(
      secondSchedule.schedule.id,
      rescheduled.schedule.version,
      scheduleInput(String(round._id), String(projectFour._id), String(secondaryPanel._id), '2026-10-10T12:30:00.000Z'),
      actor
    );
    assert.equal(startedReschedule.success, false);
    assert.equal(startedReschedule.reason, 'not-reschedulable');

    const concurrentSchedules = await Promise.all([
      scheduleVivaSession(
        scheduleInput(String(round._id), String(projectFive._id), String(primaryPanel._id), '2026-10-10T14:00:00.000Z'),
        actor
      ),
      scheduleVivaSession(
        scheduleInput(String(round._id), String(projectSix._id), String(primaryPanel._id), '2026-10-10T14:00:00.000Z'),
        actor
      ),
    ]);
    assert.equal(concurrentSchedules.filter((result) => result.success).length, 1);
    assert.equal(concurrentSchedules.filter((result) => !result.success).length, 1);

    const schedules = await getVivaSchedules();
    assert.equal(schedules.length, 4);
    assert.equal(await VivaAuditEvent.countDocuments({ event: 'session-scheduled' }), 5);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 12,
      seededTeams: 6,
      verified: ['panel-eligibility', 'own-supervisor-assignment', 'teacher-overlap', 'student-overlap', 'duplicate-attempt', 'reschedule', 'optimistic-concurrency', 'concurrent-overlap', 'started-session-lock', 'utc-reservation'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
