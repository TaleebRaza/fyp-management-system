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
  { recordVivaAuditEvent, withVivaTransaction },
  { findSharedStorageKeys },
] = await Promise.all([
  importTypeScriptModuleWithDependencies('models/User.ts'),
  importTypeScriptModuleWithDependencies('models/Project.ts'),
  importTypeScriptModuleWithDependencies('models/VivaRound.ts'),
  importTypeScriptModuleWithDependencies('models/VivaPanel.ts'),
  importTypeScriptModuleWithDependencies('models/VivaSession.ts'),
  importTypeScriptModuleWithDependencies('models/VivaAuditEvent.ts'),
  importTypeScriptModuleWithDependencies('lib/vivaPersistence.ts'),
  importTypeScriptModuleWithDependencies('lib/storageReferenceSafety.ts'),
]);

const roundConfiguration = {
  name: 'Fall 2026 Viva',
  targetPanelSize: 2,
  minimumPanelSize: 2,
  vivaDurationMinutes: 30,
};

function personSnapshot(user) {
  return {
    userId: String(user._id),
    name: user.name,
    rollNo: user.rollNo,
  };
}

function sessionPayload({ sessionId, round, panel, project, students, panelMembers, result = null }) {
  const panelAdmin = panelMembers[0];
  const startedAt = new Date('2026-09-15T09:00:00.000Z');

  return {
    ...(sessionId ? { _id: sessionId } : {}),
    roundId: round._id,
    panelId: panel._id,
    projectId: project._id,
    scheduledAt: startedAt,
    startedAt,
    vivaEndsAt: new Date('2026-09-15T09:30:00.000Z'),
    roundSnapshot: { ...roundConfiguration },
    projectSnapshot: {
      projectId: String(project._id),
      title: project.title,
      description: project.description,
      domains: project.domains,
      tools: project.tools,
      pdfUrl: project.pdfUrl,
      pdfSize: project.pdfSize,
      members: students.map(personSnapshot),
      supervisor: personSnapshot(panelAdmin),
    },
    panelSnapshot: {
      panelId: String(panel._id),
      panelAdmin: personSnapshot(panelAdmin),
      examiners: panelMembers.map(personSnapshot),
    },
    ...(result ? { result } : {}),
  };
}

function auditInput(roundId, sessionId, actor) {
  return {
    roundId: String(roundId),
    sessionId: String(sessionId),
    event: 'session-started',
    actorId: String(actor._id),
    actorRole: actor.role,
    actorName: actor.name,
    actorRollNo: actor.rollNo,
  };
}

async function createSessionWithAudit(input, actor) {
  return withVivaTransaction(async (databaseSession) => {
    const vivaSession = new VivaSession(input);
    await vivaSession.save({ session: databaseSession });
    await recordVivaAuditEvent(
      auditInput(input.roundId, vivaSession._id, actor),
      databaseSession
    );
    return String(vivaSession._id);
  });
}

export async function runVivaPersistenceIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_viva_m2_test'
  ) {
    throw new Error('VIVA_TEST_MONGODB_URI must target local database fyp_viva_m2_test.');
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

    const admin = await User.create({
      name: 'Admin Example',
      email: 'admin.viva@example.test',
      rollNo: 'A26-0001',
      password: 'not-a-real-password',
      role: 'admin',
    });
    const examinerOne = await User.create({
      name: 'Examiner One',
      email: 'examiner.one@example.test',
      rollNo: 'E26-0001',
      password: 'not-a-real-password',
      role: 'supervisor',
    });
    const examinerTwo = await User.create({
      name: 'Examiner Two',
      email: 'examiner.two@example.test',
      rollNo: 'E26-0002',
      password: 'not-a-real-password',
      role: 'supervisor',
    });
    const examinerThree = await User.create({
      name: 'Examiner Three',
      email: 'examiner.three@example.test',
      rollNo: 'E26-0003',
      password: 'not-a-real-password',
      role: 'supervisor',
    });
    const studentOne = await User.create({
      name: 'Student One',
      email: 'student.one@example.test',
      rollNo: 'F26-0001',
      password: 'not-a-real-password',
      role: 'student',
    });
    const studentTwo = await User.create({
      name: 'Student Two',
      email: 'student.two@example.test',
      rollNo: 'F26-0002',
      password: 'not-a-real-password',
      role: 'student',
    });
    const studentThree = await User.create({
      name: 'Student Three',
      email: 'student.three@example.test',
      rollNo: 'F26-0003',
      password: 'not-a-real-password',
      role: 'student',
    });

    const projectOne = await Project.create({
      supervisorId: examinerOne._id,
      members: [studentOne._id, studentTwo._id],
      inviteCode: 'VIVA01',
      title: 'Original project title',
      description: 'Original project description',
      domains: ['web-development'],
      tools: 'TypeScript',
      pdfUrl: 'proposals/viva-history.pdf',
      pdfSize: 100,
    });
    const projectTwo = await Project.create({
      supervisorId: examinerOne._id,
      members: [studentThree._id],
      inviteCode: 'VIVA02',
      title: 'Concurrent project title',
    });
    const abortedProject = await Project.create({
      supervisorId: examinerOne._id,
      members: [studentThree._id],
      inviteCode: 'VIVA03',
      title: 'Aborted project title',
    });

    const round = await VivaRound.create({
      ...roundConfiguration,
      projectIds: [projectOne._id, projectTwo._id, abortedProject._id],
      examinerIds: [examinerOne._id, examinerTwo._id, examinerThree._id],
    });
    await assert.rejects(
      () => VivaRound.create({ ...roundConfiguration, minimumPanelSize: 3 }),
      /Invalid Viva round configuration/
    );

    const panel = await VivaPanel.create({
      roundId: round._id,
      examinerIds: [examinerOne._id, examinerTwo._id],
      panelAdminId: examinerOne._id,
    });
    await assert.rejects(
      () => VivaPanel.create({
        roundId: round._id,
        examinerIds: [examinerOne._id, examinerThree._id],
        panelAdminId: examinerOne._id,
      }),
      (error) => error && error.code === 11000
    );
    await assert.rejects(
      () => VivaPanel.create({
        roundId: round._id,
        examinerIds: [examinerTwo._id, examinerThree._id],
        panelAdminId: examinerOne._id,
      }),
      /panel admin/
    );

    const initialSessionId = await createSessionWithAudit(
      sessionPayload({
        round,
        panel,
        project: projectOne,
        students: [studentOne, studentTwo],
        panelMembers: [examinerOne, examinerTwo],
        result: { grade: 'B', percentage: 80, selectedAt: new Date('2026-09-15T09:20:00.000Z') },
      }),
      admin
    );
    await assert.rejects(
      () => new VivaSession(sessionPayload({
        round,
        panel,
        project: projectTwo,
        students: [studentThree],
        panelMembers: [examinerOne, examinerTwo],
        result: { grade: 'B', percentage: 70, selectedAt: new Date('2026-09-15T09:20:00.000Z') },
      })).validate(),
      /canonical grade percentage/
    );

    await Project.updateOne({ _id: projectOne._id }, { $set: { title: 'Changed project title' } });
    await User.findByIdAndDelete(examinerOne._id);
    const historicalSession = await VivaSession.findById(initialSessionId).lean();
    assert.equal(historicalSession.projectSnapshot.title, 'Original project title');
    assert.equal(historicalSession.panelSnapshot.panelAdmin.name, 'Examiner One');
    assert.deepEqual(historicalSession.result, {
      grade: 'B',
      percentage: 80,
      selectedAt: new Date('2026-09-15T09:20:00.000Z'),
    });
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: initialSessionId }), 1);
    await withVivaTransaction(async (databaseSession) => {
      const sharedKeys = await findSharedStorageKeys({
        keys: ['proposals/viva-history.pdf'],
        excludedProjectIds: [projectOne._id],
        session: databaseSession,
      });
      assert.deepEqual([...sharedKeys], ['proposals/viva-history.pdf']);
    });

    const completionTime = new Date('2026-09-15T09:30:00.000Z');
    const gradeWrites = await Promise.all([
      VivaSession.updateOne(
        { _id: initialSessionId, version: 0, completedAt: null },
        { $set: { completedAt: completionTime }, $inc: { version: 1 } }
      ),
      VivaSession.updateOne(
        { _id: initialSessionId, version: 0, completedAt: null },
        { $set: { completedAt: completionTime }, $inc: { version: 1 } }
      ),
    ]);
    assert.equal(gradeWrites.reduce((count, write) => count + write.modifiedCount, 0), 1);
    assert.equal((await VivaSession.findById(initialSessionId).lean()).version, 1);

    const legacyRoundId = new mongoose.Types.ObjectId();
    const legacySessionId = new mongoose.Types.ObjectId();
    await VivaRound.collection.insertOne({
      _id: legacyRoundId,
      name: 'Legacy Viva',
      factors: [{ id: 'presentation', label: 'Presentation' }],
      targetPanelSize: 2,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      extraGradingDurationMinutes: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await VivaSession.collection.insertOne({
      _id: legacySessionId,
      roundId: legacyRoundId,
      panelId: panel._id,
      projectId: new mongoose.Types.ObjectId(),
      examinerSheets: [{
        examiner: personSnapshot(examinerTwo),
        scores: [{ factorId: 'presentation', value: 8, source: 'examiner' }],
      }],
      version: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assert.deepEqual(
      (await VivaRound.findById(legacyRoundId).lean()).factors.map((factor) => factor.id),
      ['presentation']
    );
    assert.equal((await VivaSession.findById(legacySessionId).lean()).examinerSheets[0].scores[0].value, 8);

    await VivaSession.updateOne(
      { _id: initialSessionId },
      { $set: { cancelledAt: new Date('2026-09-15T09:35:00.000Z'), cancellationReason: 'Room unavailable' } }
    );
    const replacementSessionId = await createSessionWithAudit(
      sessionPayload({
        round,
        panel,
        project: projectOne,
        students: [studentOne, studentTwo],
        panelMembers: [examinerOne, examinerTwo],
      }),
      admin
    );
    const replacement = await VivaSession.findById(replacementSessionId).lean();
    assert.equal(replacement.result, undefined);

    const abortedSessionId = new mongoose.Types.ObjectId();
    await assert.rejects(
      () => withVivaTransaction(async (databaseSession) => {
        const abortedSession = new VivaSession(sessionPayload({
          sessionId: abortedSessionId,
          round,
          panel,
          project: abortedProject,
          students: [studentThree],
          panelMembers: [examinerOne, examinerTwo],
        }));
        await abortedSession.save({ session: databaseSession });
        await recordVivaAuditEvent(
          auditInput(round._id, abortedSession._id, admin),
          databaseSession
        );
        throw new Error('Force transaction rollback.');
      }),
      /Force transaction rollback/
    );
    assert.equal(await VivaSession.countDocuments({ _id: abortedSessionId }), 0);
    assert.equal(await VivaAuditEvent.countDocuments({ sessionId: abortedSessionId }), 0);

    const concurrentPayload = sessionPayload({
      round,
      panel,
      project: projectTwo,
      students: [studentThree],
      panelMembers: [examinerOne, examinerTwo],
    });
    const concurrentResults = await Promise.allSettled([
      createSessionWithAudit(concurrentPayload, admin),
      createSessionWithAudit(concurrentPayload, admin),
    ]);
    assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(
      await VivaSession.countDocuments({ roundId: round._id, projectId: projectTwo._id, cancelledAt: null }),
      1
    );

    console.log(JSON.stringify({
      database: testDatabase.pathname.slice(1),
      seededUsers: 7,
      verified: ['schema-validation', 'panel-admin', 'history-snapshots', 'legacy-read', 'snapshot-file-reference', 'replacement-attempt', 'rollback', 'concurrent-write'],
    }));
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
