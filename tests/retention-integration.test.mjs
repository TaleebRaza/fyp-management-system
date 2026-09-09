import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const confirmation = process.env.FYP_RETENTION_TEST_CONFIRM;
const mongoUri = process.env.FYP_RETENTION_TEST_MONGODB_URI;
const runIntegration = confirmation === 'LOCAL_FALSE_DATA' && Boolean(mongoUri);

test('configured retention deletes only eligible false data and one concurrent run wins the lease', {
  skip: !runIntegration,
}, async () => {
  process.env.MONGODB_URI = mongoUri;

  const [retention, systemConfigModule, userModule, projectModule, voiceModule, quotaModule, reservationModule, outboxModule] = await Promise.all([
    importTypeScriptModule('lib/retention.ts'),
    importTypeScriptModule('models/SystemConfig.ts'),
    importTypeScriptModule('models/User.ts'),
    importTypeScriptModule('models/Project.ts'),
    importTypeScriptModule('models/VoiceNote.ts'),
    importTypeScriptModule('models/VoiceNoteQuota.ts'),
    importTypeScriptModule('models/UploadReservation.ts'),
    importTypeScriptModule('models/StorageDeletionOutbox.ts'),
  ]);
  const SystemConfig = systemConfigModule.default;
  const User = userModule.default;
  const Project = projectModule.default;
  const VoiceNote = voiceModule.default;
  const VoiceNoteQuota = quotaModule.default;
  const UploadReservation = reservationModule.default;
  const StorageDeletionOutbox = outboxModule.default;
  const now = new Date();
  const old = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const studentId = new mongoose.Types.ObjectId();
  const projectId = new mongoose.Types.ObjectId();
  const playedVoiceKey = `voicenotes/${studentId}/${projectId}/played.webm`;
  const unplayedVoiceKey = `voicenotes/${studentId}/${projectId}/unplayed.webm`;
  const orphanPdfKey = `proposals/${studentId}/orphan.pdf`;
  const attachedPdfKey = `proposals/${studentId}/attached.pdf`;

  try {
    await mongoose.connect(mongoUri);
    await mongoose.connection.dropDatabase();
    await SystemConfig.create({ configKey: 'storage', usedBytes: 4_096, reservedBytes: 0 });
    await User.create({
      _id: studentId,
      name: 'False Data Student',
      email: 'false-student@example.test',
      rollNo: 'F23-0001',
      password: 'not-a-real-password',
      role: 'student',
      studentMessageId: 'student-message',
      studentMessageType: 'audio',
      studentMessageContent: `student-messages/${studentId}/message.webm`,
      studentMessageSize: 32,
      studentMessageCreatedAt: old,
      studentMessageAcknowledgedAt: now,
    });
    await Project.create({
      _id: projectId,
      members: [studentId],
      inviteCode: 'RETENTION-FALSE-DATA',
      pdfUrl: attachedPdfKey,
      pdfSize: 64,
    });
    await VoiceNote.create([
      {
        projectId,
        senderId: studentId,
        blobUrl: playedVoiceKey,
        fileSize: 48,
        isPlayed: true,
        playedAt: old,
      },
      {
        projectId,
        senderId: studentId,
        blobUrl: unplayedVoiceKey,
        fileSize: 48,
        isPlayed: false,
      },
    ]);
    await VoiceNoteQuota.create({ ownerId: studentId, projectId, count: 2 });
    await UploadReservation.create([
      {
        key: orphanPdfKey,
        ownerId: studentId,
        kind: 'pdf',
        expectedBytes: 80,
        actualBytes: 80,
        expectedContentType: 'application/pdf',
        actualContentType: 'application/pdf',
        state: 'finalized',
        idempotencyKey: 'orphan-pdf',
        expiresAt: now,
      },
      {
        key: attachedPdfKey,
        ownerId: studentId,
        kind: 'pdf',
        expectedBytes: 64,
        actualBytes: 64,
        expectedContentType: 'application/pdf',
        actualContentType: 'application/pdf',
        state: 'finalized',
        idempotencyKey: 'attached-pdf',
        expiresAt: now,
      },
    ]);
    await mongoose.connection.collection('uploadreservations').updateMany({}, { $set: { updatedAt: old } });
    await retention.saveRetentionSettings({
      schedule: { enabled: true, timezone: 'UTC', time: '00:00' },
      playedVoiceNotes: { enabled: true, ageDays: 7 },
      unplayedVoiceNotes: { enabled: false, ageDays: 7 },
      audioBroadcasts: { enabled: false, ageDays: 7 },
      unusedPdfUploads: { enabled: true, ageDays: 7 },
    });

    const results = await Promise.all([
      retention.processConfiguredRetention(),
      retention.processConfiguredRetention(),
    ]);
    assert.equal(results.filter((result) => result.status === 'completed').length, 1);
    assert.equal(await VoiceNote.countDocuments({ blobUrl: playedVoiceKey }), 0);
    assert.equal(await VoiceNote.countDocuments({ blobUrl: unplayedVoiceKey }), 1);
    assert.equal((await VoiceNoteQuota.findOne({ ownerId: studentId, projectId }).lean()).count, 1);
    assert.equal((await User.findById(studentId).lean()).studentMessageAcknowledgedAt.toISOString(), now.toISOString());

    const queuedKeys = (await StorageDeletionOutbox.find({}).select('key').lean())
      .map((entry) => entry.key)
      .sort();
    assert.deepEqual(queuedKeys, [orphanPdfKey, playedVoiceKey].sort());
    assert.ok((await UploadReservation.findOne({ key: orphanPdfKey }).lean()).retentionCleanupQueuedAt);
    assert.equal((await UploadReservation.findOne({ key: attachedPdfKey }).lean()).retentionCleanupQueuedAt, null);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
