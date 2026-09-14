import assert from 'node:assert/strict';

import mongoose from 'mongoose';

import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';

const [
  { default: User },
  { default: Project },
  { default: VivaRound },
  { default: VivaAuditEvent },
  {
    createVivaRound,
    getVivaRoundAdminData,
    parseVivaRoundInput,
    updateVivaRound,
  },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
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
    factors: [
      { id: 'presentation', label: 'Presentation' },
      { id: 'technical', label: 'Technical knowledge' },
    ],
    targetPanelSize: 3,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    extraGradingDurationMinutes: 10,
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
    await Promise.all([User.init(), Project.init(), VivaRound.init(), VivaAuditEvent.init()]);

    const [supervisorOne, supervisorTwo, inactiveSupervisor, studentOne, studentTwo, inactiveStudent] = await User.create([
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
        name: 'Inactive Examiner',
        email: 'inactive.examiner@example.test',
        rollNo: 'E26-0003',
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
        members: [studentOne._id, studentTwo._id],
        inviteCode: 'VIVA-M3-ONE',
        title: 'Active team project',
      },
      {
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
    assert.deepEqual(
      persisted.factors.map((factor) => factor.id),
      ['presentation', 'technical']
    );
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
      [String(supervisorOne._id), String(supervisorTwo._id)]
    );

    const updated = await updateVivaRound(
      createdRound.id,
      mustParse(roundRequest(
        [String(activeTeam._id)],
        [String(supervisorOne._id), String(supervisorTwo._id)],
        {
          name: 'Fall 2026 Final Viva',
          factors: [
            { id: 'technical', label: 'Technical knowledge' },
            { id: 'presentation', label: 'Presentation' },
          ],
        }
      )),
      actor
    );
    assert.equal(updated.success, true, updated.success ? '' : updated.error);
    assert.equal(updated.round.name, 'Fall 2026 Final Viva');
    assert.deepEqual(updated.round.factors.map((factor) => factor.id), ['technical', 'presentation']);
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

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 6,
      seededTeams: 2,
      verified: ['input-validation', 'create-audit', 'active-selection', 'factor-ordering', 'update-audit', 'frozen-round-rejection'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
