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
  { applyAutomaticVivaSchedule, previewAutomaticVivaSchedule, scheduleVivaSession },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts'),
]);

function availability(roundId, startsAt, endsAt) {
  return {
    roundId,
    availability: [{
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      locationLabel: 'Lab 3',
    }],
  };
}

function scheduleInput(roundId, projectId, panelId, scheduledAt) {
  return {
    roundId,
    projectId,
    panelId,
    scheduledAt: new Date(scheduledAt),
    locationLabel: 'Lab 3',
  };
}

export async function runVivaAutomaticSchedulingIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m13_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m13_test.');
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

    const [
      admin,
      supervisorOne,
      supervisorTwo,
      supervisorThree,
      supervisorFour,
      supervisorFive,
      supervisorSix,
      studentOne,
      studentTwo,
      studentThree,
      studentFour,
      studentFive,
      studentSix,
    ] = await User.create([
      { name: 'Admin Example', email: 'admin.auto@example.test', rollNo: 'A26-0013', password: 'not-a-real-password', role: 'admin' },
      { name: 'Supervisor One', email: 'auto.supervisor.one@example.test', rollNo: 'E26-0101', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Two', email: 'auto.supervisor.two@example.test', rollNo: 'E26-0102', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Three', email: 'auto.supervisor.three@example.test', rollNo: 'E26-0103', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Four', email: 'auto.supervisor.four@example.test', rollNo: 'E26-0104', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Five', email: 'auto.supervisor.five@example.test', rollNo: 'E26-0105', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Supervisor Six', email: 'auto.supervisor.six@example.test', rollNo: 'E26-0106', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student One', email: 'auto.student.one@example.test', rollNo: 'F26-0101', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Two', email: 'auto.student.two@example.test', rollNo: 'F26-0102', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Three', email: 'auto.student.three@example.test', rollNo: 'F26-0103', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Four', email: 'auto.student.four@example.test', rollNo: 'F26-0104', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Five', email: 'auto.student.five@example.test', rollNo: 'F26-0105', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Six', email: 'auto.student.six@example.test', rollNo: 'F26-0106', password: 'not-a-real-password', role: 'student' },
    ]);
    const actor = { id: String(admin._id), name: admin.name, rollNo: admin.rollNo };

    const [alpha, beta, gamma, delta, echo, existing] = await Project.create([
      { supervisorId: supervisorOne._id, members: [studentOne._id], inviteCode: 'AUTO01', title: 'Alpha team' },
      { supervisorId: supervisorTwo._id, members: [studentTwo._id], inviteCode: 'AUTO02', title: 'Beta team' },
      { supervisorId: supervisorThree._id, members: [studentThree._id], inviteCode: 'AUTO03', title: 'Gamma team' },
      { supervisorId: supervisorFour._id, members: [studentFour._id], inviteCode: 'AUTO04', title: 'Delta team' },
      { supervisorId: supervisorSix._id, members: [studentFive._id], inviteCode: 'AUTO05', title: 'Echo team' },
      { supervisorId: supervisorSix._id, members: [studentSix._id], inviteCode: 'AUTO06', title: 'Existing team' },
    ]);
    const round = await VivaRound.create({
      name: 'Automatic Scheduling Viva',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: [alpha._id, beta._id, gamma._id, delta._id, echo._id, existing._id],
      examinerIds: [
        supervisorOne._id,
        supervisorTwo._id,
        supervisorThree._id,
        supervisorFour._id,
        supervisorFive._id,
        supervisorSix._id,
      ],
    });
    const [firstPanel, secondPanel, undersizedPanel] = await VivaPanel.create([
      {
        roundId: round._id,
        examinerIds: [supervisorTwo._id, supervisorThree._id],
        panelAdminId: supervisorTwo._id,
      },
      {
        roundId: round._id,
        examinerIds: [supervisorFour._id, supervisorFive._id],
        panelAdminId: supervisorFour._id,
      },
      { roundId: round._id, examinerIds: [supervisorSix._id], panelAdminId: supervisorSix._id },
    ]);
    const seededSchedule = await scheduleVivaSession(
      scheduleInput(String(round._id), String(existing._id), String(firstPanel._id), '2026-11-10T10:00:00.000Z'),
      actor
    );
    assert.equal(seededSchedule.success, true, seededSchedule.success ? '' : seededSchedule.error);

    const limitedPreview = await previewAutomaticVivaSchedule(
      availability(String(round._id), '2026-11-10T10:00:00.000Z', '2026-11-10T10:30:00.000Z')
    );
    assert.equal(limitedPreview.success, true, limitedPreview.success ? '' : limitedPreview.error);
    if (!limitedPreview.success) throw new Error(limitedPreview.error);
    assert.equal(limitedPreview.draft.scheduled.length, 1);
    assert.equal(limitedPreview.draft.unplaced.length, 5);
    assert.equal(limitedPreview.draft.scheduled[0].panelId, String(secondPanel._id));

    const previewInput = availability(
      String(round._id),
      '2026-11-10T09:00:00.000Z',
      '2026-11-10T11:00:00.000Z'
    );
    const [firstPreview, secondPreview] = await Promise.all([
      previewAutomaticVivaSchedule(previewInput),
      previewAutomaticVivaSchedule(previewInput),
    ]);
    assert.equal(firstPreview.success, true, firstPreview.success ? '' : firstPreview.error);
    assert.equal(secondPreview.success, true, secondPreview.success ? '' : secondPreview.error);
    if (!firstPreview.success || !secondPreview.success) throw new Error('Automatic Viva preview unexpectedly failed.');
    assert.deepEqual(firstPreview.draft, secondPreview.draft);
    assert.equal(firstPreview.draft.scheduled.length, 5);
    assert.equal(firstPreview.draft.unplaced.length, 1);
    assert.ok(firstPreview.draft.unplaced.some((entry) => entry.projectId === String(existing._id)));
    assert.ok(firstPreview.draft.scheduled.every((entry) => entry.panelId !== String(undersizedPanel._id)));
    assert.ok(firstPreview.draft.scheduled.every((entry) => (
      entry.panelId !== String(firstPanel._id) || entry.scheduledAt !== '2026-11-10T10:00:00.000Z'
    )));

    const applied = await applyAutomaticVivaSchedule({
      roundId: String(round._id),
      schedules: firstPreview.draft.scheduled.map((entry) => ({
        roundId: String(round._id),
        projectId: entry.projectId,
        panelId: entry.panelId,
        scheduledAt: new Date(entry.scheduledAt),
        locationLabel: entry.locationLabel,
      })),
    }, actor);
    assert.equal(applied.success, true, applied.success ? '' : applied.error);
    if (!applied.success) throw new Error(applied.error);
    assert.equal(applied.schedules.length, 5);
    assert.equal(await VivaSession.countDocuments({}), 6);
    assert.equal(await VivaAuditEvent.countDocuments({ event: 'session-scheduled' }), 6);

    const cancelledProjectId = applied.schedules[0].projectId;
    await VivaSession.updateOne(
      { _id: applied.schedules[0].id },
      { $set: { cancelledAt: new Date('2026-11-10T12:00:00.000Z') } }
    );
    const stalePreview = await previewAutomaticVivaSchedule(
      availability(String(round._id), '2026-11-10T11:00:00.000Z', '2026-11-10T11:30:00.000Z')
    );
    assert.equal(stalePreview.success, true, stalePreview.success ? '' : stalePreview.error);
    if (!stalePreview.success) throw new Error(stalePreview.error);
    assert.equal(stalePreview.draft.scheduled.length, 1);
    assert.equal(stalePreview.draft.scheduled[0].projectId, cancelledProjectId);

    const replacement = stalePreview.draft.scheduled[0];
    const concurrentManualSchedule = await scheduleVivaSession({
      roundId: String(round._id),
      projectId: replacement.projectId,
      panelId: replacement.panelId,
      scheduledAt: new Date(replacement.scheduledAt),
      locationLabel: replacement.locationLabel,
    }, actor);
    assert.equal(concurrentManualSchedule.success, true, concurrentManualSchedule.success ? '' : concurrentManualSchedule.error);

    const staleApply = await applyAutomaticVivaSchedule({
      roundId: String(round._id),
      schedules: stalePreview.draft.scheduled.map((entry) => ({
        roundId: String(round._id),
        projectId: entry.projectId,
        panelId: entry.panelId,
        scheduledAt: new Date(entry.scheduledAt),
        locationLabel: entry.locationLabel,
      })),
    }, actor);
    assert.equal(staleApply.success, false);
    assert.equal(staleApply.reason, 'invalid');
    assert.match(staleApply.error, /already has a Viva attempt/);
    assert.equal(await VivaSession.countDocuments({}), 7);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 13,
      seededTeams: 6,
      verified: ['deterministic-draft', 'constrained-teams', 'insufficient-capacity', 'panel-eligibility', 'existing-bookings', 'atomic-apply', 'stale-draft-revalidation'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
