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
  { startVivaSession },
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

export async function runVivaAccessRestrictionIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m8_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m8_test.');
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

    const [systemAdmin, panelAdmin, panelMember, unrelatedSupervisor, projectSupervisor, student] = await User.create([
      { name: 'System Admin', email: 'admin.access@example.test', rollNo: 'A26-0001', password: 'not-a-real-password', role: 'admin' },
      { name: 'Panel Admin', email: 'panel.admin.access@example.test', rollNo: 'E26-0001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Panel Member', email: 'panel.member.access@example.test', rollNo: 'E26-0002', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Unrelated Supervisor', email: 'unrelated.access@example.test', rollNo: 'E26-0003', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Project Supervisor', email: 'project.supervisor.access@example.test', rollNo: 'E26-0004', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student', email: 'student.access@example.test', rollNo: 'F26-0001', password: 'not-a-real-password', role: 'student' },
    ]);
    const project = await Project.create({
      supervisorId: projectSupervisor._id,
      members: [student._id],
      inviteCode: 'VIVA801',
      title: 'Access restriction team',
    });
    const round = await VivaRound.create({
      name: 'Access restriction Viva',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: [project._id],
      examinerIds: [panelAdmin._id, panelMember._id],
    });
    const panel = await VivaPanel.create({
      roundId: round._id,
      examinerIds: [panelAdmin._id, panelMember._id],
      panelAdminId: panelAdmin._id,
    });
    const scheduled = await scheduleVivaSession({
      roundId: String(round._id),
      panelId: String(panel._id),
      projectId: String(project._id),
      scheduledAt: new Date('2026-10-10T09:00:00.000Z'),
      locationLabel: 'Viva Lab',
    }, actor(systemAdmin));
    assert.equal(scheduled.success, true, scheduled.success ? '' : scheduled.error);

    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), false);
    const started = await startVivaSession(scheduled.schedule.id, actor(panelAdmin), new Date('2026-10-10T09:00:00.000Z'));
    assert.equal(started.success, true, started.success ? '' : started.error);

    await VivaPanel.updateOne(
      { _id: panel._id },
      { $set: { examinerIds: [panelAdmin._id], panelAdminId: panelAdmin._id } }
    );
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelAdmin._id)), false);
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), true);
    assert.equal(await isVivaPanelMemberAccessRestricted(String(unrelatedSupervisor._id)), false);
    assert.equal(await isVivaPanelMemberAccessRestricted(String(systemAdmin._id)), false);
    assert.equal(await isVivaPanelMemberAccessRestricted(String(student._id)), false);
    assert.equal(await isVivaPanelMemberAccessRestricted('not-an-object-id'), false);

    await VivaSession.updateOne(
      { _id: scheduled.schedule.id },
      { $set: { completedAt: new Date('2026-10-10T09:30:00.000Z') } }
    );
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), false);

    await VivaSession.updateOne(
      { _id: scheduled.schedule.id },
      { $set: { completedAt: null, cancelledAt: new Date('2026-10-10T09:31:00.000Z') } }
    );
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), false);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 6,
      seededTeams: 1,
      verified: ['scheduled-access', 'active-panel-member-restriction', 'panel-admin-access', 'unrelated-access', 'snapshot-membership', 'completed-release', 'cancelled-release'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
