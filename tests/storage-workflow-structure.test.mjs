import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('storage reservations keep pending bytes and atomically claimed deletion work separate', async () => {
  const [reservation, outbox, protocol] = await Promise.all([
    read('models/UploadReservation.ts'),
    read('models/StorageDeletionOutbox.ts'),
    read('lib/storageProtocol.ts'),
  ]);

  assert.match(reservation, /key: \{ type: String, required: true, unique: true/);
  assert.match(reservation, /state: \{ type: String, enum: \['pending', 'finalized', 'cancelled'\]/);
  assert.doesNotMatch(reservation, /expireAfterSeconds/);
  assert.match(outbox, /state: \{ type: String, enum: \['pending', 'processing', 'dead-letter'\]/);
  assert.match(outbox, /lockToken/);
  assert.match(protocol, /reservedBytes/);
  assert.match(protocol, /HeadObjectCommand/);
  assert.match(protocol, /GetObjectCommand/);
  assert.match(protocol, /processStorageDeletionOutbox/);
  assert.match(protocol, /verifiedBytes/);
  assert.match(protocol, /reservedBytes: reservation\.expectedBytes/);
  assert.match(protocol, /Storage ledger is not initialized/);
  assert.doesNotMatch(protocol, /\$setOnInsert: \{ usedBytes: 0, reservedBytes: 0 \}/);
});

test('storage transactions allow callbacks that only write state', async () => {
  const protocol = await read('lib/storageProtocol.ts');

  assert.match(protocol, /let value!: T;/);
  assert.doesNotMatch(protocol, /Storage transaction returned no result/);
});

test('submission and review enqueue email work without awaiting SMTP', async () => {
  const [outbox, student, review] = await Promise.all([
    read('lib/emailOutbox.ts'),
    read('app/api/dashboard/student/route.ts'),
    read('lib/projectReview.ts'),
  ]);

  assert.match(outbox, /findOneAndUpdate/);
  assert.match(outbox, /state: 'processing'/);
  assert.match(outbox, /maxJobLagMs/);
  assert.match(student, /enqueueNotificationEmail/);
  assert.match(review, /enqueueNotificationEmail/);
  assert.doesNotMatch(student, /sendNotificationEmail/);
  assert.doesNotMatch(review, /sendNotificationEmail/);
});

test('voice, broadcast, PDF submission, and review use reservation finalization instead of direct object deletion', async () => {
  const [voice, broadcast, student, review] = await Promise.all([
    read('app/api/voice/route.ts'),
    read('app/api/dashboard/supervisor/broadcast/route.ts'),
    read('app/api/dashboard/student/route.ts'),
    read('lib/projectReview.ts'),
  ]);

  assert.match(voice, /finalizeUploadReservation/);
  assert.doesNotMatch(voice, /DeleteObjectCommand/);
  assert.match(broadcast, /finalizeUploadReservation/);
  assert.doesNotMatch(broadcast, /DeleteObjectCommand/);
  assert.match(student, /finalizeUploadReservation/);
  assert.match(student, /enqueueStorageDeletion/);
  assert.match(review, /withStorageTransaction/);
  assert.match(review, /enqueueStorageDeletion/);
  assert.doesNotMatch(review, /DeleteObjectCommand/);
});

test('academic reset and team changes use transaction callbacks with durable cleanup', async () => {
  const [academicReset, projectCleanup, join, leave] = await Promise.all([
    read('lib/academicReset.ts'),
    read('lib/projectStorageCleanup.ts'),
    read('app/api/project/join/route.ts'),
    read('app/api/project/leave/route.ts'),
  ]);

  assert.match(academicReset, /mongoSession\.withTransaction/);
  assert.match(academicReset, /student\.domains = \[\]/);
  assert.match(academicReset, /enqueueDeletedProjectStorage/);
  assert.match(projectCleanup, /enqueueStorageDeletion/);
  assert.match(projectCleanup, /VoiceNote\.deleteMany/);
  assert.doesNotMatch(academicReset, /DeleteObjectCommand/);
  assert.match(join, /session\.withTransaction/);
  assert.match(join, /enqueueDeletedProjectStorage/);
  assert.match(join, /User\.findOne\(\{ _id: currentUser\.id, role: 'student' \}\)\.session\(session\)/);
  assert.doesNotMatch(join, /withTransactionRetry/);
  assert.match(leave, /session\.withTransaction/);
  assert.doesNotMatch(leave, /withTransactionRetry/);
});

test('the deployed cron expires reservations and supervisor deletion queues audio cleanup', async () => {
  const [cron, supervisorDeletion, deployment] = await Promise.all([
    read('app/api/cron/voice-cleanup/route.ts'),
    read('app/api/delete-supervisor/route.ts'),
    read('vercel.json'),
  ]);

  assert.match(cron, /expireUploadReservations/);
  assert.match(cron, /processStorageDeletionOutbox/);
  assert.match(deployment, /\/api\/cron\/voice-cleanup/);
  assert.match(deployment, /"schedule": "0 0 \* \* \*"/);
  assert.match(supervisorDeletion, /enqueueStorageDeletion/);
  assert.match(supervisorDeletion, /supervisor-deleted/);
});
