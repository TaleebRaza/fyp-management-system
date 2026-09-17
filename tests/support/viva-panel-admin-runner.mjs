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
  {
    getVivaRoundAdminData,
    updateVivaRound,
  },
  {
    parseVivaPanelAllocationInput,
    parseVivaPanelSaveInput,
    previewRandomVivaPanels,
    saveVivaPanels,
  },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
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

function allocationInput(roundId, panelRevision) {
  const parsed = parseVivaPanelAllocationInput({ roundId, panelRevision });
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
    await Promise.all([User.init(), Project.init(), VivaRound.init(), VivaPanel.init(), VivaSession.init(), VivaAuditEvent.init()]);

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

    const inactiveAllocation = await previewRandomVivaPanels(allocationInput(String(round._id), 2));
    assert.equal(inactiveAllocation.success, false);
    assert.equal(inactiveAllocation.reason, 'invalid');

    await VivaRound.updateOne({ _id: round._id }, {
      $set: {
        examinerIds: [supervisorOne, supervisorTwo, supervisorThree].map(({ _id }) => _id),
      },
    });
    const randomAllocation = await previewRandomVivaPanels(allocationInput(String(round._id), 2));
    assert.equal(randomAllocation.success, true, randomAllocation.success ? '' : randomAllocation.error);
    assert.equal(randomAllocation.panels.length, 2);
    assert.deepEqual(randomAllocation.panels.map(({ examinerIds }) => examinerIds.length), [2, 1]);
    assert.deepEqual(
      randomAllocation.panels.flatMap(({ examinerIds }) => examinerIds).sort(),
      [supervisorOne, supervisorTwo, supervisorThree].map(({ _id }) => String(_id)).sort()
    );
    assert.equal(
      randomAllocation.panels.every(({ examinerIds, panelAdminId }) => examinerIds.includes(panelAdminId)),
      true
    );
    assert.equal(await VivaPanel.countDocuments({ roundId: round._id }), 2);

    const savedRandomAllocation = await saveVivaPanels(
      saveInput(String(round._id), 2, randomAllocation.panels),
      actor
    );
    assert.equal(savedRandomAllocation.success, true, savedRandomAllocation.success ? '' : savedRandomAllocation.error);
    assert.equal(savedRandomAllocation.panelRevision, 3);

    await VivaSession.create({
      roundId: round._id,
      panelId: savedRandomAllocation.panels[0].id,
      projectId: project._id,
      scheduledAt: new Date('2026-10-10T09:00:00.000Z'),
      vivaEndsAt: new Date('2026-10-10T09:30:00.000Z'),
      locationLabel: 'Viva Lab',
    });
    const lockedMembership = await saveVivaPanels(saveInput(String(round._id), 3, savedRandomAllocation.panels), actor);
    assert.equal(lockedMembership.success, false);
    assert.equal(lockedMembership.reason, 'frozen');

    const staleAllocation = await previewRandomVivaPanels(allocationInput(String(round._id), 2));
    assert.equal(staleAllocation.success, false);
    assert.equal(staleAllocation.reason, 'concurrent-change');

    const largeSupervisors = await User.create(Array.from({ length: 500 }, (_, index) => ({
      name: `Allocation Supervisor ${index + 1}`,
      email: `allocation.supervisor.${index + 1}@example.test`,
      rollNo: `E26-${index + 1000}`,
      password: 'not-a-real-password',
      role: 'supervisor',
    })));
    const largeRound = await VivaRound.create(roundInput(
      String(project._id),
      largeSupervisors.map(({ _id }) => String(_id)),
      { name: 'Large allocation Viva', targetPanelSize: 3, minimumPanelSize: 2 }
    ));
    const largeAllocation = await previewRandomVivaPanels(allocationInput(String(largeRound._id), 0));
    assert.equal(largeAllocation.success, true, largeAllocation.success ? '' : largeAllocation.error);
    assert.equal(largeAllocation.panels.length, 167);
    assert.equal(largeAllocation.panels.at(-1)?.examinerIds.length, 2);
    assert.deepEqual(
      largeAllocation.panels.flatMap(({ examinerIds }) => examinerIds).sort(),
      largeSupervisors.map(({ _id }) => String(_id)).sort()
    );
    assert.equal(
      largeAllocation.panels.every(({ examinerIds, panelAdminId }) => examinerIds.includes(panelAdminId)),
      true
    );
    assert.equal(await VivaPanel.countDocuments({ roundId: largeRound._id }), 0);

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
    const frozenResult = await saveVivaPanels(saveInput(String(round._id), 3, [{
      examinerIds: [String(supervisorOne._id), String(supervisorTwo._id)],
      panelAdminId: String(supervisorTwo._id),
    }]), actor);
    assert.equal(frozenResult.success, false);
    assert.equal(frozenResult.reason, 'frozen');
    assert.equal(await VivaPanel.countDocuments({ roundId: round._id }), 2);

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 506,
      seededTeams: 1,
      verified: ['panel-admin', 'below-minimum-panel', 'active-teacher', 'random-allocation', 'random-panel-admin', 'remainder-panel', 'preview-without-write', 'large-allocation', 'atomic-save', 'concurrent-save', 'scheduled-membership-lock', 'round-update-protection', 'frozen-membership'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
