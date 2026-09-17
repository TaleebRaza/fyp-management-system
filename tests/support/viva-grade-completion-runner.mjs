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
  { scheduleVivaSession },
  { completeVivaSession, getPanelAdminVivaSessions, saveVivaGrade, startVivaSession },
  { isVivaPanelMemberAccessRestricted },
  { VIVA_GRADE_SCALE },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaParticipantLock.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaSessionDashboard.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaAccessRestriction.ts'),
  importTypeScriptModuleWithDependencies('lib/viva.ts'),
]);

function actor(user) {
  return { id: String(user._id), name: user.name, rollNo: user.rollNo };
}

export async function runVivaGradeCompletionIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m9_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m9_test.');
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
      VivaParticipantLock.init(),
      VivaAuditEvent.init(),
    ]);

    const [systemAdmin, panelAdmin, panelMember, projectSupervisor, student] = await User.create([
      { name: 'System Admin', email: 'admin.grading@example.test', rollNo: 'A26-0001', password: 'not-a-real-password', role: 'admin' },
      { name: 'Panel Admin', email: 'panel.admin.grading@example.test', rollNo: 'E26-0001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Panel Member', email: 'panel.member.grading@example.test', rollNo: 'E26-0002', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Project Supervisor', email: 'project.supervisor.grading@example.test', rollNo: 'E26-0003', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student', email: 'student.grading@example.test', rollNo: 'F26-0001', password: 'not-a-real-password', role: 'student' },
    ]);
    const project = await Project.create({
      supervisorId: projectSupervisor._id,
      members: [student._id],
      inviteCode: 'VIVA901',
      title: 'Grade completion team',
    });
    const round = await VivaRound.create({
      name: 'Grade Completion Viva',
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
      locationLabel: 'Viva Lab',
    });
    const scheduled = await scheduleVivaSession(
      {
        roundId: String(round._id),
        panelId: String(panel._id),
        projectId: String(project._id),
        scheduledAt: new Date('2026-10-10T09:00:00.000Z'),
        locationLabel: 'Viva Lab',
      },
      actor(systemAdmin)
    );
    assert.equal(scheduled.success, true, scheduled.success ? '' : scheduled.error);

    const started = await startVivaSession(
      scheduled.schedule.id,
      actor(panelAdmin),
      new Date('2026-10-10T09:00:00.000Z')
    );
    assert.equal(started.success, true, started.success ? '' : started.error);
    assert.equal(started.workspace.result, null);
    assert.deepEqual(started.workspace.gradeScale, VIVA_GRADE_SCALE);
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), true);

    const unauthorizedSave = await saveVivaGrade(
      scheduled.schedule.id,
      started.workspace.version,
      'A',
      actor(panelMember),
      new Date('2026-10-10T09:01:00.000Z')
    );
    assert.equal(unauthorizedSave.success, false);
    assert.equal(unauthorizedSave.reason, 'forbidden');

    const incompleteCompletion = await completeVivaSession(
      scheduled.schedule.id,
      started.workspace.version,
      actor(panelAdmin),
      new Date('2026-10-10T09:01:00.000Z')
    );
    assert.equal(incompleteCompletion.success, false);
    assert.equal(incompleteCompletion.reason, 'invalid');

    const invalidGrade = await saveVivaGrade(
      scheduled.schedule.id,
      started.workspace.version,
      'A-',
      actor(panelAdmin),
      new Date('2026-10-10T09:01:00.000Z')
    );
    assert.equal(invalidGrade.success, false);
    assert.equal(invalidGrade.reason, 'invalid');

    const tamperedGrade = await saveVivaGrade(
      scheduled.schedule.id,
      started.workspace.version,
      { grade: 'A', percentage: 1 },
      actor(panelAdmin),
      new Date('2026-10-10T09:01:00.000Z')
    );
    assert.equal(tamperedGrade.success, false);
    assert.equal(tamperedGrade.reason, 'invalid');

    let workspace = started.workspace;
    for (const [index, grade] of VIVA_GRADE_SCALE.entries()) {
      const saved = await saveVivaGrade(
        scheduled.schedule.id,
        workspace.version,
        grade.grade,
        actor(panelAdmin),
        new Date(`2026-10-10T09:${String(index + 2).padStart(2, '0')}:00.000Z`)
      );
      assert.equal(saved.success, true, saved.success ? '' : saved.error);
      assert.deepEqual(saved.workspace.result, grade);
      workspace = saved.workspace;
    }

    const reloaded = await getPanelAdminVivaSessions(String(panelAdmin._id));
    assert.equal(reloaded.length, 1);
    assert.deepEqual(reloaded[0].result, VIVA_GRADE_SCALE.at(-1));
    assert.equal(reloaded[0].version, workspace.version);

    const staleSave = await saveVivaGrade(
      scheduled.schedule.id,
      workspace.version - 1,
      'A',
      actor(panelAdmin),
      new Date('2026-10-10T09:10:00.000Z')
    );
    assert.equal(staleSave.success, false);
    assert.equal(staleSave.reason, 'concurrent-change');

    const concurrentSaves = await Promise.all([
      saveVivaGrade(scheduled.schedule.id, workspace.version, 'A+', actor(panelAdmin), new Date('2026-10-10T09:11:00.000Z')),
      saveVivaGrade(scheduled.schedule.id, workspace.version, 'B', actor(panelAdmin), new Date('2026-10-10T09:11:00.000Z')),
    ]);
    assert.equal(concurrentSaves.filter((result) => result.success).length, 1);
    assert.equal(concurrentSaves.filter((result) => !result.success).length, 1);
    const savedRace = concurrentSaves.find((result) => result.success);
    assert.ok(savedRace?.success);
    workspace = savedRace.workspace;

    const completionRace = await Promise.all([
      completeVivaSession(scheduled.schedule.id, workspace.version, actor(panelAdmin), new Date('2026-10-10T09:12:00.000Z')),
      saveVivaGrade(scheduled.schedule.id, workspace.version, 'D', actor(panelAdmin), new Date('2026-10-10T09:12:00.000Z')),
    ]);
    assert.equal(completionRace.filter((result) => result.success).length, 1);
    let completed = completionRace.find((result) => result.success && 'completedAt' in result);
    if (!completed) {
      const savedInRace = completionRace.find((result) => result.success && 'workspace' in result);
      assert.ok(savedInRace?.success && 'workspace' in savedInRace);
      completed = await completeVivaSession(
        scheduled.schedule.id,
        savedInRace.workspace.version,
        actor(panelAdmin),
        new Date('2026-10-10T09:13:00.000Z')
      );
      assert.equal(completed.success, true, completed.success ? '' : completed.error);
    }
    assert.ok(completed?.success && 'completedAt' in completed);

    const completedSession = await VivaSession.findById(scheduled.schedule.id).lean();
    assert.ok(completedSession.completedAt);
    assert.equal(completed.workspace.phase, 'completed');
    assert.equal(completed.workspace.id, scheduled.schedule.id);
    assert.equal(completed.workspace.version, completedSession.version);
    assert.ok(completedSession.result);
    assert.equal(completedSession.result.percentage, VIVA_GRADE_SCALE.find((grade) => grade.grade === completedSession.result.grade)?.percentage);
    assert.equal(await isVivaPanelMemberAccessRestricted(String(panelMember._id)), false);

    const postCompletionSave = await saveVivaGrade(
      scheduled.schedule.id,
      completedSession.version,
      'F',
      actor(panelAdmin),
      new Date('2026-10-10T09:14:00.000Z')
    );
    assert.equal(postCompletionSave.success, false);
    assert.equal(postCompletionSave.reason, 'not-startable');
    const completedAgenda = await getPanelAdminVivaSessions(String(panelAdmin._id));
    assert.equal(completedAgenda.length, 1);
    assert.equal(completedAgenda[0].phase, 'completed');
    assert.equal(completedAgenda[0].canManage, true);
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: scheduled.schedule.id, event: 'session-finalized' }), 1);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 5,
      seededTeams: 1,
      verified: ['all-grades', 'canonical-percentage', 'tampered-grade-rejection', 'panel-admin-only', 'refresh', 'stale-version', 'concurrent-saves', 'save-complete-race', 'immutable-completion', 'access-release'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
