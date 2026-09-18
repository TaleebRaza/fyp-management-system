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
    createVivaRound,
    confirmVivaRound,
    deleteVivaRound,
    getVivaRoundAdminData,
    parseVivaRoundInput,
    updateVivaRound,
  },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaRoundAdmin.ts'),
]);

const actor = {
  id: '000000000000000000000001',
  name: 'Admin Example',
  rollNo: 'A26-0001',
};

function roundRequest(projectIds, examinerIds, overrides = {}) {
  return {
    name: 'Fall 2026 Viva',
    targetPanelSize: 3,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    projectIds,
    examinerIds,
    ...overrides,
  };
}

function mustParse(value) {
  const parsed = parseVivaRoundInput(value);
  assert.equal(parsed.success, true, parsed.success ? '' : parsed.error);
  return parsed.input;
}

export async function runVivaRoundAdminIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m3_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m3_test.');
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

    const [supervisorOne, supervisorTwo, projectSupervisor, inactiveSupervisor, studentOne, studentTwo, inactiveStudent] = await User.create([
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
        name: 'Project Supervisor',
        email: 'project.supervisor.round@example.test',
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
        name: 'Student One',
        email: 'student.one@example.test',
        rollNo: 'F26-0001',
        password: 'not-a-real-password',
        role: 'student',
      },
      {
        name: 'Student Two',
        email: 'student.two@example.test',
        rollNo: 'F26-0002',
        password: 'not-a-real-password',
        role: 'student',
      },
      {
        name: 'Inactive Student',
        email: 'inactive.student@example.test',
        rollNo: 'F26-0003',
        password: 'not-a-real-password',
        role: 'student',
        isActive: false,
      },
    ]);

    const [activeTeam, inactiveTeam] = await Project.create([
      {
        supervisorId: projectSupervisor._id,
        members: [studentOne._id, studentTwo._id],
        inviteCode: 'VIVA-M3-ONE',
        title: 'Active team project',
      },
      {
        supervisorId: projectSupervisor._id,
        members: [inactiveStudent._id],
        inviteCode: 'VIVA-M3-TWO',
        title: 'Inactive team project',
      },
    ]);

    assert.equal(parseVivaRoundInput({}).success, false);
    assert.equal(
      parseVivaRoundInput(roundRequest([], [String(supervisorOne._id)])).success,
      false
    );
    assert.equal(
      parseVivaRoundInput(roundRequest([String(activeTeam._id)], [])).success,
      false
    );

    const created = await createVivaRound(
      mustParse(roundRequest([String(activeTeam._id)], [String(supervisorOne._id), String(supervisorTwo._id)])),
      actor
    );
    assert.equal(created.success, true, created.success ? '' : created.error);
    const createdRound = created.round;

    const persisted = await VivaRound.findById(createdRound.id).lean();
    assert.equal(persisted.factors, undefined);
    assert.deepEqual(persisted.projectIds.map(String), [String(activeTeam._id)]);
    assert.deepEqual(
      persisted.examinerIds.map(String),
      [String(supervisorOne._id), String(supervisorTwo._id)]
    );
    assert.equal(await VivaAuditEvent.countDocuments({ roundId: createdRound.id, event: 'round-created' }), 1);

    const selection = await getVivaRoundAdminData();
    assert.deepEqual(selection.teams.map((team) => team.id), [String(activeTeam._id)]);
    assert.deepEqual(
      selection.examiners.map((examiner) => examiner.id),
      [String(supervisorOne._id), String(supervisorTwo._id), String(projectSupervisor._id)]
    );

    const updated = await updateVivaRound(
      createdRound.id,
      mustParse(roundRequest(
        [String(activeTeam._id)],
        [String(supervisorOne._id), String(supervisorTwo._id)],
        {
          name: 'Fall 2026 Final Viva',
        }
      )),
      actor
    );
    assert.equal(updated.success, true, updated.success ? '' : updated.error);
    assert.equal(updated.round.name, 'Fall 2026 Final Viva');
    assert.equal(await VivaAuditEvent.countDocuments({ roundId: createdRound.id, event: 'round-updated' }), 1);

    const inactiveTeacherResult = await createVivaRound(
      mustParse(roundRequest([String(activeTeam._id)], [String(inactiveSupervisor._id)])),
      actor
    );
    assert.equal(inactiveTeacherResult.success, false);
    assert.equal(inactiveTeacherResult.reason, 'selection-unavailable');

    const inactiveTeamResult = await createVivaRound(
      mustParse(roundRequest([String(inactiveTeam._id)], [String(supervisorOne._id)])),
      actor
    );
    assert.equal(inactiveTeamResult.success, false);
    assert.equal(inactiveTeamResult.reason, 'selection-unavailable');

    const deletable = await createVivaRound(
      mustParse(roundRequest([String(activeTeam._id)], [String(supervisorOne._id), String(supervisorTwo._id)], {
        name: 'Delete this scheduled Viva',
        targetPanelSize: 2,
      })),
      actor
    );
    assert.equal(deletable.success, true, deletable.success ? '' : deletable.error);
    const deletablePanel = await VivaPanel.create({
      roundId: deletable.round.id,
      examinerIds: [supervisorOne._id, supervisorTwo._id],
      panelAdminId: supervisorOne._id,
    });
    await VivaSession.create({
      roundId: deletable.round.id,
      panelId: deletablePanel._id,
      projectId: activeTeam._id,
      scheduledAt: new Date('2026-10-10T09:00:00.000Z'),
      vivaEndsAt: new Date('2026-10-10T09:30:00.000Z'),
    });
    const confirmedDeletable = await confirmVivaRound(deletable.round.id, actor);
    assert.equal(confirmedDeletable.success, true, confirmedDeletable.success ? '' : confirmedDeletable.error);
    const invalidDelete = await deleteVivaRound('invalid-round-id');
    assert.equal(invalidDelete.success, false);
    assert.equal(invalidDelete.reason, 'invalid');
    const deleted = await deleteVivaRound(deletable.round.id);
    assert.equal(deleted.success, true, deleted.success ? '' : deleted.error);
    assert.equal(await VivaRound.countDocuments({ _id: deletable.round.id }), 0);
    assert.equal(await VivaPanel.countDocuments({ roundId: deletable.round.id }), 0);
    assert.equal(await VivaSession.countDocuments({ roundId: deletable.round.id }), 0);
    assert.equal(await VivaAuditEvent.countDocuments({ roundId: deletable.round.id }), 0);

    const startedPanel = await VivaPanel.create({
      roundId: createdRound.id,
      examinerIds: [supervisorOne._id, supervisorTwo._id],
      panelAdminId: supervisorOne._id,
    });
    await VivaSession.create({
      roundId: createdRound.id,
      panelId: startedPanel._id,
      projectId: activeTeam._id,
      scheduledAt: new Date('2026-10-11T09:00:00.000Z'),
      startedAt: new Date('2026-10-11T09:00:00.000Z'),
      vivaEndsAt: new Date('2026-10-11T09:30:00.000Z'),
    });
    const startedDelete = await deleteVivaRound(createdRound.id);
    assert.equal(startedDelete.success, false);
    assert.equal(startedDelete.reason, 'frozen');
    assert.ok(await VivaRound.exists({ _id: createdRound.id }));

    await VivaRound.updateOne({ _id: createdRound.id }, { $set: { frozenAt: new Date() } });
    const frozenUpdate = await updateVivaRound(
      createdRound.id,
      mustParse(roundRequest(
        [String(activeTeam._id)],
        [String(supervisorOne._id), String(supervisorTwo._id)],
        { name: 'This update must be rejected' }
      )),
      actor
    );
    assert.equal(frozenUpdate.success, false);
    assert.equal(frozenUpdate.reason, 'frozen');
    assert.equal((await VivaRound.findById(createdRound.id).lean()).name, 'Fall 2026 Final Viva');
    const frozenDelete = await deleteVivaRound(createdRound.id);
    assert.equal(frozenDelete.success, false);
    assert.equal(frozenDelete.reason, 'frozen');
    assert.ok(await VivaRound.exists({ _id: createdRound.id }));

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 7,
      seededTeams: 2,
      verified: ['input-validation', 'create-audit', 'active-selection', 'no-factor-requirement', 'update-audit', 'scheduled-round-deletion', 'started-round-rejection', 'legacy-frozen-round-rejection'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
