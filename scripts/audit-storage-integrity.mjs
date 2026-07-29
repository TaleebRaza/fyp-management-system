import { createHash } from 'node:crypto';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';

const shouldRepair = process.argv.includes('--repair');
const confirmation = 'I_STOPPED_APP_AND_CRONS';
const requiredEnvironment = [
  'MONGODB_URI',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length > 0) {
  console.error(`Missing ${missingEnvironment.join(', ')}. No changes were made.`);
  process.exit(1);
}
if (shouldRepair && process.env.CONFIRM_STORAGE_LEDGER_REPAIR !== confirmation) {
  console.error(
    `Ledger repair requires CONFIRM_STORAGE_LEDGER_REPAIR=${confirmation}. Stop the app and crons first. No changes were made.`
  );
  process.exit(1);
}

function normalizeStorageKey(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  let path = rawValue;
  try {
    path = new URL(rawValue).pathname;
  } catch {}

  let decoded = path;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return null;
    }
  }

  const key = decoded.replace(/^\/+/, '');
  if (!key || key.length > 500 || key.includes('\\') || key.includes('\0')) return null;
  if (key.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return key;
}

function keyHash(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

function safeBytes(value) {
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : 0;
}

function duplicateKeys(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = normalizeStorageKey(row.key);
    if (!key) continue;
    const ids = byKey.get(key) || [];
    ids.push(String(row._id));
    byKey.set(key, ids);
  }
  return Array.from(byKey.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([key, ids]) => ({ keyHash: keyHash(key), ids }));
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function listBucketObjects() {
  const objects = new Map();
  let continuationToken;

  do {
    const page = await s3.send(new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents || []) {
      if (object.Key) objects.set(object.Key, safeBytes(object.Size));
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && !continuationToken) {
      throw new Error('R2 returned a truncated object list without a continuation token.');
    }
  } while (continuationToken);

  return objects;
}

await mongoose.connect(process.env.MONGODB_URI);

try {
  const database = mongoose.connection;
  const [
    bucketObjects,
    projects,
    voiceNotes,
    supervisors,
    reservations,
    deletionTargets,
    storageConfigs,
  ] = await Promise.all([
    listBucketObjects(),
    database.collection('projects').find(
      { pdfUrl: { $exists: true, $nin: ['', null] } },
      { projection: { pdfUrl: 1 } }
    ).toArray(),
    database.collection('voicenotes').find(
      {},
      { projection: { projectId: 1, blobUrl: 1 } }
    ).toArray(),
    database.collection('users').find(
      { role: 'supervisor', broadcastType: 'audio' },
      { projection: { broadcastContent: 1 } }
    ).toArray(),
    database.collection('uploadreservations').find(
      {},
      { projection: { key: 1, state: 1, expectedBytes: 1, expiresAt: 1 } }
    ).toArray(),
    database.collection('storagedeletionoutboxes').find(
      {},
      { projection: { key: 1, bytes: 1, reservedBytes: 1, verifiedBytes: 1, state: 1 } }
    ).toArray(),
    database.collection('systemconfigs').find({ configKey: 'storage' }).toArray(),
  ]);
  const storageConfig = storageConfigs[0] || null;

  const activeReferences = new Map();
  const invalidReferences = [];
  const addReference = (kind, recordId, value) => {
    const key = normalizeStorageKey(value);
    if (!key) {
      invalidReferences.push({ kind, recordId: String(recordId) });
      return;
    }
    const references = activeReferences.get(key) || [];
    references.push({ kind, recordId: String(recordId) });
    activeReferences.set(key, references);
  };

  for (const project of projects) addReference('project', project._id, project.pdfUrl);
  for (const voiceNote of voiceNotes) addReference('voice-note', voiceNote._id, voiceNote.blobUrl);
  for (const supervisor of supervisors) {
    addReference('broadcast', supervisor._id, supervisor.broadcastContent);
  }

  const projectIds = new Set(
    (await database.collection('projects').find({}, { projection: { _id: 1 } }).toArray())
      .map((project) => String(project._id))
  );
  const danglingVoiceNotes = voiceNotes
    .filter((voiceNote) => !projectIds.has(String(voiceNote.projectId)))
    .map((voiceNote) => String(voiceNote._id));

  const reservationByKey = new Map(
    reservations.flatMap((reservation) => {
      const key = normalizeStorageKey(reservation.key);
      return key ? [[key, reservation]] : [];
    })
  );
  const deletionKeys = new Set(
    deletionTargets.map((target) => normalizeStorageKey(target.key)).filter(Boolean)
  );
  const invalidReservationIds = reservations
    .filter((reservation) => !normalizeStorageKey(reservation.key))
    .map((reservation) => String(reservation._id));
  const invalidDeletionTargetIds = deletionTargets
    .filter((target) => !normalizeStorageKey(target.key))
    .map((target) => String(target._id));
  const duplicateReservationKeys = duplicateKeys(reservations);
  const duplicateDeletionKeys = duplicateKeys(deletionTargets);
  const missingActiveObjects = Array.from(activeReferences.entries())
    .filter(([key]) => !bucketObjects.has(key))
    .map(([key, references]) => ({ keyHash: keyHash(key), references }));
  const orphanObjects = Array.from(bucketObjects.entries())
    .filter(([key]) =>
      !activeReferences.has(key)
      && !deletionKeys.has(key)
      && reservationByKey.get(key)?.state !== 'pending'
    );
  const crossKindReferences = Array.from(activeReferences.entries()).flatMap(([key, references]) => {
    const kinds = new Set(references.map((reference) => reference.kind));
    return kinds.size > 1 ? [{ keyHash: keyHash(key), references }] : [];
  });
  const duplicateReferences = Array.from(activeReferences.entries())
    .filter(([, references]) => references.length > 1)
    .map(([key, references]) => ({ keyHash: keyHash(key), references }));

  let usedBytes = 0;
  let bucketBytes = 0;
  for (const [key, bytes] of bucketObjects) {
    bucketBytes += bytes;
    const reservation = reservationByKey.get(key);
    const isUnfinalizedObject = reservation?.state === 'pending'
      || (reservation?.state === 'cancelled' && deletionKeys.has(key));
    if (!isUnfinalizedObject) usedBytes += bytes;
  }
  for (const target of deletionTargets) {
    const key = normalizeStorageKey(target.key);
    const reservation = key ? reservationByKey.get(key) : null;
    const releasesUsedBytes = safeBytes(target.reservedBytes) === 0
      && reservation?.state !== 'pending'
      && reservation?.state !== 'cancelled';
    if (key && !bucketObjects.has(key) && releasesUsedBytes) {
      usedBytes += safeBytes(target.verifiedBytes);
    }
  }
  const reservedBytes = reservations
    .filter((reservation) => reservation.state === 'pending')
    .reduce((sum, reservation) => sum + safeBytes(reservation.expectedBytes), 0)
    + deletionTargets.reduce((sum, target) => sum + safeBytes(target.reservedBytes), 0);
  const storedUsedBytes = safeBytes(storageConfig?.usedBytes);
  const storedReservedBytes = safeBytes(storageConfig?.reservedBytes);
  const storedLedgerIsValid = Boolean(
    storageConfigs.length === 1
    && storageConfig
    && Number.isSafeInteger(storageConfig.usedBytes)
    && storageConfig.usedBytes >= 0
    && Number.isSafeInteger(storageConfig.reservedBytes)
    && storageConfig.reservedBytes >= 0
  );
  const ledgerMismatch = !storedLedgerIsValid
    || storedUsedBytes !== usedBytes
    || storedReservedBytes !== reservedBytes;
  const expiredPendingReservations = reservations.filter(
    (reservation) => reservation.state === 'pending'
      && new Date(reservation.expiresAt).getTime() <= Date.now()
  );
  const deadLetters = deletionTargets.filter((target) => target.state === 'dead-letter');

  const report = {
    mode: shouldRepair ? 'repair' : 'report',
    bucket: {
      objects: bucketObjects.size,
      bytes: bucketBytes,
    },
    references: {
      activeKeys: activeReferences.size,
      invalid: invalidReferences,
      missingObjects: missingActiveObjects,
      crossKind: crossKindReferences,
      duplicate: duplicateReferences,
      danglingVoiceNoteIds: danglingVoiceNotes,
    },
    cleanup: {
      outboxRows: deletionTargets.length,
      deadLetters: deadLetters.length,
      expiredPendingReservations: expiredPendingReservations.length,
      invalidReservationIds,
      invalidDeletionTargetIds,
      duplicateReservationKeys,
      duplicateDeletionKeys,
    },
    orphans: {
      objects: orphanObjects.length,
      bytes: orphanObjects.reduce((sum, [, bytes]) => sum + bytes, 0),
      sampleKeyHashes: orphanObjects.slice(0, 20).map(([key]) => keyHash(key)),
    },
    ledger: {
      rows: storageConfigs.length,
      stored: storageConfig
        ? { usedBytes: storedUsedBytes, reservedBytes: storedReservedBytes }
        : null,
      canonical: { usedBytes, reservedBytes },
      mismatch: ledgerMismatch,
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (shouldRepair && ledgerMismatch) {
    if (storageConfigs.length > 1) {
      throw new Error('Refusing ledger repair because multiple storage configuration rows exist.');
    }
    if (duplicateReservationKeys.length > 0 || duplicateDeletionKeys.length > 0) {
      throw new Error('Refusing ledger repair because duplicate storage workflow keys exist.');
    }
    const systemConfigs = database.collection('systemconfigs');
    let repaired = false;

    if (storageConfig) {
      const result = await systemConfigs.updateOne(
        {
          _id: storageConfig._id,
          usedBytes: Object.hasOwn(storageConfig, 'usedBytes')
            ? storageConfig.usedBytes
            : { $exists: false },
          reservedBytes: Object.hasOwn(storageConfig, 'reservedBytes')
            ? storageConfig.reservedBytes
            : { $exists: false },
        },
        { $set: { usedBytes, reservedBytes, updatedAt: new Date() } }
      );
      repaired = result.modifiedCount === 1;
    } else {
      const result = await systemConfigs.updateOne(
        { configKey: 'storage' },
        {
          $setOnInsert: {
            configKey: 'storage',
            usedBytes,
            reservedBytes,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );
      repaired = result.upsertedCount === 1;
    }

    if (!repaired) {
      throw new Error('Storage ledger changed during repair. No ledger values were overwritten. Run the audit again.');
    }
    console.log(JSON.stringify({ repaired: true, usedBytes, reservedBytes }));
  }

  const hasBlockingIssue = invalidReferences.length > 0
    || missingActiveObjects.length > 0
    || danglingVoiceNotes.length > 0
    || crossKindReferences.length > 0
    || duplicateReferences.length > 0
    || invalidReservationIds.length > 0
    || invalidDeletionTargetIds.length > 0
    || duplicateReservationKeys.length > 0
    || duplicateDeletionKeys.length > 0
    || deadLetters.length > 0
    || orphanObjects.length > 0
    || (!shouldRepair && ledgerMismatch);
  if (hasBlockingIssue) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
