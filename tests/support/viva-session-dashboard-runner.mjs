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
  { scheduleVivaSession },
  { getPanelAdminVivaSessions, startVivaSession },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaSessionDashboard.ts'),
]);

function actor(user) {
  return { id: String(user._id), name: user.name, rollNo: user.rollNo };
}

async function createScheduledSession({
  label,
  project,
  examiners,
  panelAdmin,
  admin,
  scheduledAt,
}) {
  const round = await VivaRound.create({
    name: `${label} Viva`,
    targetPanelSize: 3,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    projectIds: [project._id],
    examinerIds: examiners.map((examiner) => examiner._id),
  });
  const panel = await VivaPanel.create({
    roundId: round._id,
    examinerIds: examiners.map((examiner) => examiner._id),
    panelAdminId: panelAdmin._id,
  });
  const scheduled = await scheduleVivaSession(
    {
      roundId: String(round._id),
      panelId: String(panel._id),
      projectId: String(project._id),
      scheduledAt: new Date(scheduledAt),
      locationLabel: 'Viva Lab',
    },
    actor(admin)
  );
  assert.equal(scheduled.success, true, scheduled.success ? '' : scheduled.error);
  return { round, panel, sessionId: scheduled.schedule.id };
}

export async function runVivaSessionDashboardIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m7_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m7_test.');
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
      systemAdmin,
      panelAdmin,
      panelMember,
      replacementAdmin,
      panelAlternate,
      concurrentAdmin,
      concurrentMember,
      projectSupervisor,
      studentOne,
      studentTwo,
      studentThree,
      studentFour,
    ] = await User.create([
      { name: 'System Admin', email: 'admin.session@example.test', rollNo: 'A26-0001', password: 'not-a-real-password', role: 'admin' },
      { name: 'Panel Admin', email: 'panel.admin@example.test', rollNo: 'E26-0001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Panel Member', email: 'panel.member@example.test', rollNo: 'E26-0002', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Replacement Admin', email: 'replacement.admin@example.test', rollNo: 'E26-0003', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Panel Alternate', email: 'panel.alternate@example.test', rollNo: 'E26-0004', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Concurrent Admin', email: 'concurrent.admin@example.test', rollNo: 'E26-0005', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Concurrent Member', email: 'concurrent.member@example.test', rollNo: 'E26-0006', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Project Supervisor', email: 'project.supervisor@example.test', rollNo: 'E26-0007', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student One', email: 'student.one.session@example.test', rollNo: 'F26-0001', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Two', email: 'student.two.session@example.test', rollNo: 'F26-0002', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Three', email: 'student.three.session@example.test', rollNo: 'F26-0003', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Four', email: 'student.four.session@example.test', rollNo: 'F26-0004', password: 'not-a-real-password', role: 'student' },
    ]);
    const [membershipProject, replacementProject, activeProject, conflictProject, concurrentProject] = await Project.create([
      { supervisorId: projectSupervisor._id, members: [studentOne._id], inviteCode: 'VIVA701', title: 'Membership snapshot team' },
      { supervisorId: projectSupervisor._id, members: [studentTwo._id], inviteCode: 'VIVA702', title: 'Replacement admin team' },
      { supervisorId: projectSupervisor._id, members: [studentThree._id], inviteCode: 'VIVA703', title: 'Active session team' },
      { supervisorId: projectSupervisor._id, members: [studentFour._id], inviteCode: 'VIVA704', title: 'Conflict team' },
      { supervisorId: projectSupervisor._id, members: [studentOne._id], inviteCode: 'VIVA705', title: 'Concurrent start team' },
    ]);

    const membership = await createScheduledSession({
      label: 'Membership',
      project: membershipProject,
      examiners: [panelAdmin, panelMember, panelAlternate],
      panelAdmin,
      admin: systemAdmin,
      scheduledAt: '2026-10-10T09:00:00.000Z',
    });
    const assignedBeforeStart = await getPanelAdminVivaSessions(String(panelAdmin._id));
    assert.equal(assignedBeforeStart.length, 1);
    assert.equal(assignedBeforeStart[0].project.title, 'Membership snapshot team');

    const nonPanelAdminStart = await startVivaSession(
      membership.sessionId,
      actor(panelMember),
      new Date('2026-10-10T09:00:00.000Z')
    );
    assert.equal(nonPanelAdminStart.success, false);
    assert.equal(nonPanelAdminStart.reason, 'forbidden');

    await VivaPanel.updateOne(
      { _id: membership.panel._id },
      { $set: { examinerIds: [panelAdmin._id, panelAlternate._id], panelAdminId: panelAdmin._id } }
    );
    const membershipStart = await startVivaSession(
      membership.sessionId,
      actor(panelAdmin),
      new Date('2026-10-10T09:00:00.000Z')
    );
    assert.equal(membershipStart.success, true, membershipStart.success ? '' : membershipStart.error);
    assert.equal(membershipStart.started, true);
    assert.deepEqual(
      membershipStart.workspace.panel.members.map((member) => member.id),
      [String(panelAdmin._id), String(panelAlternate._id)]
    );
    assert.equal(membershipStart.workspace.vivaEndsAt, '2026-10-10T09:30:00.000Z');
    assert.ok((await VivaRound.findById(membership.round._id).lean()).frozenAt);

    const repeatedStart = await startVivaSession(
      membership.sessionId,
      actor(panelAdmin),
      new Date('2026-10-10T10:00:00.000Z')
    );
    assert.equal(repeatedStart.success, true, repeatedStart.success ? '' : repeatedStart.error);
    assert.equal(repeatedStart.started, false);
    assert.equal(repeatedStart.workspace.startedAt, '2026-10-10T09:00:00.000Z');
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: membership.sessionId, event: 'session-started' }), 1);
    await VivaSession.updateOne({ _id: membership.sessionId }, { $set: { completedAt: new Date('2026-10-10T09:30:00.000Z') } });

    const replacement = await createScheduledSession({
      label: 'Replacement',
      project: replacementProject,
      examiners: [panelAdmin, panelMember, replacementAdmin],
      panelAdmin,
      admin: systemAdmin,
      scheduledAt: '2026-10-10T10:00:00.000Z',
    });
    await VivaPanel.updateOne({ _id: replacement.panel._id }, { $set: { panelAdminId: replacementAdmin._id } });
    const stalePanelAdminStart = await startVivaSession(
      replacement.sessionId,
      actor(panelAdmin),
      new Date('2026-10-10T10:00:00.000Z')
    );
    assert.equal(stalePanelAdminStart.success, false);
    assert.equal(stalePanelAdminStart.reason, 'forbidden');
    const replacementStart = await startVivaSession(
      replacement.sessionId,
      actor(replacementAdmin),
      new Date('2026-10-10T10:00:00.000Z')
    );
    assert.equal(replacementStart.success, true, replacementStart.success ? '' : replacementStart.error);
    await VivaSession.updateOne({ _id: replacement.sessionId }, { $set: { completedAt: new Date('2026-10-10T10:30:00.000Z') } });

    const active = await createScheduledSession({
      label: 'Active',
      project: activeProject,
      examiners: [panelAdmin, panelMember],
      panelAdmin,
      admin: systemAdmin,
      scheduledAt: '2026-10-10T11:00:00.000Z',
    });
    const activeStart = await startVivaSession(
      active.sessionId,
      actor(panelAdmin),
      new Date('2026-10-10T11:00:00.000Z')
    );
    assert.equal(activeStart.success, true, activeStart.success ? '' : activeStart.error);

    const conflict = await createScheduledSession({
      label: 'Conflict',
      project: conflictProject,
      examiners: [panelAdmin, panelAlternate],
      panelAdmin,
      admin: systemAdmin,
      scheduledAt: '2026-10-10T12:00:00.000Z',
    });
    const conflictMemberBeforeRejectedStart = await User.findById(panelAlternate._id).select('updatedAt').lean();
    const overlapStart = await startVivaSession(
      conflict.sessionId,
      actor(panelAdmin),
      new Date('2026-10-10T12:00:00.000Z')
    );
    assert.equal(overlapStart.success, false);
    assert.match(overlapStart.error, /already in an active session/);
    assert.equal(
      (await User.findById(panelAlternate._id).select('updatedAt').lean()).updatedAt.getTime(),
      conflictMemberBeforeRejectedStart.updatedAt.getTime()
    );
    await VivaSession.updateOne({ _id: active.sessionId }, { $set: { completedAt: new Date('2026-10-10T11:30:00.000Z') } });

    const crossSessionRace = await createScheduledSession({
      label: 'Cross-session race',
      project: membershipProject,
      examiners: [panelAdmin, panelMember],
      panelAdmin,
      admin: systemAdmin,
      scheduledAt: '2026-10-10T13:00:00.000Z',
    });
    const overlappingStarts = await Promise.all([
      startVivaSession(conflict.sessionId, actor(panelAdmin), new Date('2026-10-10T12:00:00.000Z')),
      startVivaSession(crossSessionRace.sessionId, actor(panelAdmin), new Date('2026-10-10T12:00:00.000Z')),
    ]);
    assert.equal(overlappingStarts.filter((result) => result.success && result.started).length, 1);
    assert.equal(overlappingStarts.filter((result) => !result.success).length, 1);
    const startedRace = overlappingStarts.find((result) => result.success && result.started);
    assert.ok(startedRace?.success);
    await VivaSession.updateOne(
      { _id: startedRace.workspace.id },
      { $set: { completedAt: new Date('2026-10-10T12:30:00.000Z') } }
    );

    const concurrent = await createScheduledSession({
      label: 'Concurrent',
      project: concurrentProject,
      examiners: [concurrentAdmin, concurrentMember],
      panelAdmin: concurrentAdmin,
      admin: systemAdmin,
      scheduledAt: '2026-10-10T14:00:00.000Z',
    });
    const concurrentStarts = await Promise.all([
      startVivaSession(concurrent.sessionId, actor(concurrentAdmin), new Date('2026-10-10T13:00:00.000Z')),
      startVivaSession(concurrent.sessionId, actor(concurrentAdmin), new Date('2026-10-10T13:00:00.000Z')),
    ]);
    assert.equal(concurrentStarts.filter((result) => result.success && result.started).length, 1);
    assert.equal(concurrentStarts.filter((result) => result.success && !result.started).length, 1);
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: concurrent.sessionId, event: 'session-started' }), 1);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 12,
      seededTeams: 5,
      verified: ['panel-admin-only-workspace', 'changed-panel-membership-snapshot', 'round-freeze', 'repeat-start', 'replaced-panel-admin', 'stale-panel-admin', 'active-participant-conflict', 'cross-session-start-race', 'concurrent-start'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
