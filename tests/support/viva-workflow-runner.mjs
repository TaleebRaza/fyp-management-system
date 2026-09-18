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
  { confirmVivaRound, createVivaRound },
  { previewRandomVivaPanels, saveVivaPanels },
  { scheduleVivaSession },
  { completeVivaSession, getPanelAdminVivaSessions, saveVivaGrade, startVivaSession },
  { isVivaSessionAccessRestricted },
  { getCompletedVivaResultsForStudent },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaParticipantLock.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaRoundAdmin.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaPanelAdmin.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaSessionDashboard.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaAccessRestriction.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaResults.ts'),
]);

const SUPERVISOR_COUNT = 500;

function actor(user) {
  return { id: String(user._id), name: user.name, rollNo: user.rollNo };
}

function elapsedMilliseconds(startedAt) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export async function runVivaWorkflowIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m12_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m12_test.');
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

    const [systemAdmin, projectSupervisor, studentOne, studentTwo] = await User.create([
      { name: 'System Admin', email: 'admin.workflow@example.test', rollNo: 'A26-0001', password: 'not-a-real-password', role: 'admin' },
      { name: 'Project Supervisor', email: 'project.supervisor.workflow@example.test', rollNo: 'E26-0001', password: 'not-a-real-password', role: 'supervisor' },
      { name: 'Student One', email: 'student.one.workflow@example.test', rollNo: 'F26-0001', password: 'not-a-real-password', role: 'student' },
      { name: 'Student Two', email: 'student.two.workflow@example.test', rollNo: 'F26-0002', password: 'not-a-real-password', role: 'student' },
    ]);
    const supervisors = await User.create(Array.from({ length: SUPERVISOR_COUNT }, (_, index) => ({
      name: `Workflow Supervisor ${index + 1}`,
      email: `workflow.supervisor.${index + 1}@example.test`,
      rollNo: `E26-${index + 1000}`,
      password: 'not-a-real-password',
      role: 'supervisor',
    })));
    const project = await Project.create({
      supervisorId: projectSupervisor._id,
      members: [studentOne._id, studentTwo._id],
      inviteCode: 'VIVA1201',
      title: 'Full Viva workflow team',
    });

    const roundResult = await createVivaRound({
      name: 'Full Viva workflow',
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      projectIds: [String(project._id)],
      examinerIds: supervisors.map(({ _id }) => String(_id)),
    }, actor(systemAdmin));
    assert.equal(roundResult.success, true, roundResult.success ? '' : roundResult.error);

    const previewStartedAt = process.hrtime.bigint();
    const allocation = await previewRandomVivaPanels({
      roundId: roundResult.round.id,
      panelRevision: roundResult.round.panelRevision,
    });
    const allocationPreviewMilliseconds = elapsedMilliseconds(previewStartedAt);
    assert.equal(allocation.success, true, allocation.success ? '' : allocation.error);
    assert.equal(allocation.panels.length, SUPERVISOR_COUNT / 2);
    assert.deepEqual(
      allocation.panels.flatMap(({ examinerIds }) => examinerIds).sort(),
      supervisors.map(({ _id }) => String(_id)).sort()
    );
    assert.ok(allocation.panels.every(({ examinerIds, panelAdminId }) => examinerIds.includes(panelAdminId)));

    const panelDraft = allocation.panels[0];
    const replacementPanelAdminId = panelDraft.examinerIds.find((id) => id !== panelDraft.panelAdminId);
    assert.ok(replacementPanelAdminId);
    panelDraft.panelAdminId = replacementPanelAdminId;

    const panelSaveStartedAt = process.hrtime.bigint();
    const panelSave = await saveVivaPanels({
      roundId: roundResult.round.id,
      panelRevision: allocation.panelRevision,
      panels: allocation.panels,
    }, actor(systemAdmin));
    const panelSaveMilliseconds = elapsedMilliseconds(panelSaveStartedAt);
    assert.equal(panelSave.success, true, panelSave.success ? '' : panelSave.error);
    assert.equal(panelSave.panels.length, SUPERVISOR_COUNT / 2);

    const scheduledPanel = panelSave.panels.find(({ examinerIds }) => (
      examinerIds.length === panelDraft.examinerIds.length
      && examinerIds.every((id) => panelDraft.examinerIds.includes(id))
    ));
    assert.ok(scheduledPanel);
    assert.equal(scheduledPanel.panelAdminId, replacementPanelAdminId);
    const panelAdmin = supervisors.find(({ _id }) => String(_id) === scheduledPanel.panelAdminId);
    const panelMember = supervisors.find(({ _id }) => String(_id) === scheduledPanel.examinerIds.find(
      (id) => id !== scheduledPanel.panelAdminId
    ));
    assert.ok(panelAdmin);
    assert.ok(panelMember);
    await VivaPanel.updateOne(
      { _id: scheduledPanel.id },
      { $set: { locationLabel: 'Viva Lab' } }
    );

    const scheduled = await scheduleVivaSession({
      roundId: roundResult.round.id,
      panelId: scheduledPanel.id,
      projectId: String(project._id),
      scheduledAt: new Date('2026-10-10T09:00:00.000Z'),
      locationLabel: 'Viva Lab',
    }, actor(systemAdmin));
    assert.equal(scheduled.success, true, scheduled.success ? '' : scheduled.error);
    const confirmed = await confirmVivaRound(roundResult.round.id, actor(systemAdmin));
    assert.equal(confirmed.success, true, confirmed.success ? '' : confirmed.error);
    const panelMemberAgenda = await getPanelAdminVivaSessions(String(panelMember._id));
    assert.equal(panelMemberAgenda.length, 1);
    assert.equal(panelMemberAgenda[0].canManage, false);
    assert.equal((await getPanelAdminVivaSessions(String(panelAdmin._id))).length, 1);

    const started = await startVivaSession(
      scheduled.schedule.id,
      actor(panelAdmin),
      new Date('2026-10-10T09:00:00.000Z')
    );
    assert.equal(started.success, true, started.success ? '' : started.error);
    assert.equal(started.workspace.panel.admin.id, String(panelAdmin._id));
    assert.equal(await isVivaSessionAccessRestricted(String(panelMember._id)), true);
    assert.equal(await isVivaSessionAccessRestricted(String(studentOne._id)), true);
    assert.equal(await isVivaSessionAccessRestricted(String(panelAdmin._id)), false);

    const saved = await saveVivaGrade(
      scheduled.schedule.id,
      started.workspace.version,
      'A+',
      actor(panelAdmin),
      new Date('2026-10-10T09:10:00.000Z')
    );
    assert.equal(saved.success, true, saved.success ? '' : saved.error);
    assert.deepEqual(saved.workspace.result, { grade: 'A+', percentage: 100 });

    const completed = await completeVivaSession(
      scheduled.schedule.id,
      saved.workspace.version,
      actor(panelAdmin),
      new Date('2026-10-10T09:20:00.000Z')
    );
    assert.equal(completed.success, true, completed.success ? '' : completed.error);
    assert.deepEqual(completed.result, { grade: 'A+', percentage: 100 });
    assert.equal(await isVivaSessionAccessRestricted(String(panelMember._id)), false);
    assert.equal(await isVivaSessionAccessRestricted(String(studentOne._id)), false);
    assert.deepEqual(
      await getCompletedVivaResultsForStudent(String(studentOne._id)),
      await getCompletedVivaResultsForStudent(String(studentTwo._id))
    );
    assert.deepEqual(
      (await getCompletedVivaResultsForStudent(String(studentOne._id))).map(({ grade, percentage }) => ({ grade, percentage })),
      [{ grade: 'A+', percentage: 100 }]
    );
    assert.equal(await VivaAuditEvent.countDocuments({ roundId: roundResult.round.id }), 7);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: SUPERVISOR_COUNT + 4,
      seededTeams: 1,
      measurements: {
        allocationPreviewMilliseconds: Number(allocationPreviewMilliseconds.toFixed(2)),
        panelSaveMilliseconds: Number(panelSaveMilliseconds.toFixed(2)),
      },
      verified: [
        'round-creation',
        'random-panel-allocation',
        'explicit-panel-admin-replacement',
        'transactional-panel-save',
        'panel-admin-only-workspace',
        'temporary-active-session-restriction',
        'canonical-grade-completion',
        'restriction-release',
        'immediate-result',
        'same-team-result',
      ],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
