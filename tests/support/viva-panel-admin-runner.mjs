import assert from 'node:assert/strict';

import mongoose from 'mongoose';

import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';

const [
  { default: User },
  { default: Project },
  { default: VivaRound },
  { default: VivaPanel },
  { default: VivaAuditEvent },
  {
    getVivaRoundAdminData,
    updateVivaRound,
  },
  {
    parseVivaPanelSaveInput,
    saveVivaPanels,
  },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaRoundAdmin.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaPanelAdmin.ts'),
]);

const actor = {
  id: '000000000000000000000001',
  name: 'Admin Example',
  rollNo: 'A26-0001',
};

function saveInput(roundId, panelRevision, panels) {
  const parsed = parseVivaPanelSaveInput({ roundId, panelRevision, panels });
  assert.equal(parsed.success, true, parsed.success ? '' : parsed.error);
  return parsed.input;
}

function roundInput(projectId, examinerIds, overrides = {}) {
  return {
    name: 'Fall 2026 Viva',
    targetPanelSize: 2,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    projectIds: [projectId],
    examinerIds,
    ...overrides,
  };
}

export async function runVivaPanelAdminIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m4_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m4_test.');
  }

  try {
    await mongoose.connect(testDatabaseUri);
    await mongoose.connection.dropDatabase();
    await Promise.all([User.init(), Project.init(), VivaRound.init(), VivaPanel.init(), VivaAuditEvent.init()]);

    const [supervisorOne, supervisorTwo, supervisorThree, inactiveSupervisor, outsideSupervisor, student] = await User.create([
      {
        name: 'Examiner One',
        email: 'examiner.one@example.test',
        rollNo: 'E26-0001',
        password: 'not-a-real-password',
        role: 'supervisor',
      },
      {
        name: 'Examiner Two',
        email: 'examiner.two@example.test',
        rollNo: 'E26-0002',
        password: 'not-a-real-password',
        role: 'supervisor',
      },
      {
        name: 'Examiner Three',
        email: 'examiner.three@example.test',
        rollNo: 'E26-0003',
        password: 'not-a-real-password',
        role: 'supervisor',
      },
      {
        name: 'Inactive Examiner',
        email: 'inactive.examiner@example.test',
        rollNo: 'E26-0004',
        password: 'not-a-real-password',
        role: 'supervisor',
        isActive: false,
      },
      {
        name: 'Outside Examiner',
        email: 'outside.examiner@example.test',
        rollNo: 'E26-0005',
        password: 'not-a-real-password',
        role: 'supervisor',
      },
      {
        name: 'Student One',
        email: 'student.one@example.test',
        rollNo: 'F26-0001',
        password: 'not-a-real-password',
        role: 'student',
      },
    ]);
    const project = await Project.create({
      supervisorId: supervisorOne._id,
      members: [student._id],
      inviteCode: 'VIVA-M4-ONE',
      title: 'Panel management project',
    });
    const round = await VivaRound.create(roundInput(
      String(project._id),
      [supervisorOne, supervisorTwo, supervisorThree, inactiveSupervisor].map(({ _id }) => String(_id))
    ));

    assert.equal(parseVivaPanelSaveInput({}).success, false);
    assert.equal(parseVivaPanelSaveInput({
      roundId: String(round._id),
      panelRevision: 0,
      panels: [{
        examinerIds: [String(supervisorOne._id), String(supervisorOne._id)],
        panelAdminId: String(supervisorOne._id),
      }],
    }).success, false);
    assert.equal(parseVivaPanelSaveInput({
      roundId: String(round._id),
      panelRevision: 0,
      panels: [{
        examinerIds: [String(supervisorOne._id)],
        panelAdminId: String(supervisorTwo._id),
      }],
    }).success, false);

    const initialPanels = await saveVivaPanels(saveInput(String(round._id), 0, [
      {
        examinerIds: [String(supervisorOne._id), String(supervisorTwo._id)],
        panelAdminId: String(supervisorOne._id),
      },
      {
        examinerIds: [String(supervisorThree._id)],
        panelAdminId: String(supervisorThree._id),
      },
    ]), actor);
    assert.equal(initialPanels.success, true, initialPanels.success ? '' : initialPanels.error);
    assert.equal(initialPanels.panelRevision, 1);
    assert.equal(initialPanels.panels.length, 2);
    assert.equal(initialPanels.panels[0].panelAdminId, String(supervisorOne._id));
    assert.equal(initialPanels.panels[1].examinerIds.length, 1);
    assert.equal(await VivaAuditEvent.countDocuments({ roundId: round._id, event: 'panel-created' }), 1);

    const configuration = await getVivaRoundAdminData();
    assert.equal(configuration.rounds.find(({ id }) => id === String(round._id)).panelRevision, 1);
    assert.deepEqual(
      configuration.panels.filter(({ roundId }) => roundId === String(round._id)).map(({ panelAdminId }) => panelAdminId),
      [String(supervisorOne._id), String(supervisorThree._id)]
    );

    const inactiveResult = await saveVivaPanels(saveInput(String(round._id), 1, [{
      examinerIds: [String(inactiveSupervisor._id)],
      panelAdminId: String(inactiveSupervisor._id),
    }]), actor);
    assert.equal(inactiveResult.success, false);
    assert.equal(inactiveResult.reason, 'invalid');

    const outsideResult = await saveVivaPanels(saveInput(String(round._id), 1, [{
      examinerIds: [String(outsideSupervisor._id)],
      panelAdminId: String(outsideSupervisor._id),
    }]), actor);
    assert.equal(outsideResult.success, false);
    assert.equal(outsideResult.reason, 'invalid');

    const updatedPanels = await saveVivaPanels(saveInput(String(round._id), 1, [
      {
        examinerIds: [String(supervisorOne._id), String(supervisorTwo._id)],
        panelAdminId: String(supervisorTwo._id),
      },
      {
        examinerIds: [String(supervisorThree._id)],
        panelAdminId: String(supervisorThree._id),
      },
    ]), actor);
    assert.equal(updatedPanels.success, true, updatedPanels.success ? '' : updatedPanels.error);
    assert.equal(updatedPanels.panelRevision, 2);
    assert.equal(updatedPanels.panels[0].panelAdminId, String(supervisorTwo._id));
    assert.equal(await VivaAuditEvent.countDocuments({ roundId: round._id, event: 'panel-updated' }), 1);

    const staleResult = await saveVivaPanels(saveInput(String(round._id), 1, [{
      examinerIds: [String(supervisorThree._id)],
      panelAdminId: String(supervisorThree._id),
    }]), actor);
    assert.equal(staleResult.success, false);
    assert.equal(staleResult.reason, 'concurrent-change');
    assert.equal(await VivaPanel.countDocuments({ roundId: round._id }), 2);

    const incompatibleRoundUpdate = await updateVivaRound(
      String(round._id),
      roundInput(String(project._id), [String(supervisorOne._id), String(supervisorThree._id)]),
      actor
    );
    assert.equal(incompatibleRoundUpdate.success, false);
    assert.equal(incompatibleRoundUpdate.reason, 'selection-unavailable');

    await VivaRound.updateOne({ _id: round._id }, { $set: { frozenAt: new Date() } });
    const frozenResult = await saveVivaPanels(saveInput(String(round._id), 2, [{
      examinerIds: [String(supervisorOne._id), String(supervisorTwo._id)],
      panelAdminId: String(supervisorTwo._id),
    }]), actor);
    assert.equal(frozenResult.success, false);
    assert.equal(frozenResult.reason, 'frozen');
    assert.equal(await VivaPanel.countDocuments({ roundId: round._id }), 2);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 6,
      seededTeams: 1,
      verified: ['panel-admin', 'below-minimum-panel', 'active-teacher', 'round-selection', 'atomic-save', 'concurrent-save', 'round-update-protection', 'frozen-membership'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
