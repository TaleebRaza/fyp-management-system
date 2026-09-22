import mongoose from 'mongoose';
import { refactorIndexes } from './refactor-indexes.mjs';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is required. This audit is read-only and made no changes.');
  process.exit(1);
}

const expectedIndexes = {
  projects: [{ key: { status: 1, updatedAt: -1 } }, ...refactorIndexes.projects],
  voicenotes: refactorIndexes.voicenotes,
  users: refactorIndexes.users,
  storagedeletionoutboxes: refactorIndexes.storagedeletionoutboxes,
  emailoutboxes: refactorIndexes.emailoutboxes,
  uploadreservations: refactorIndexes.uploadreservations,
  systemconfigs: refactorIndexes.systemconfigs,
  vivarounds: refactorIndexes.vivarounds,
  vivapanels: refactorIndexes.vivapanels,
  vivasessions: refactorIndexes.vivasessions,
  vivaparticipantlocks: refactorIndexes.vivaparticipantlocks,
  vivaauditevents: refactorIndexes.vivaauditevents,
};

function indexKey(index) {
  return JSON.stringify(index.key);
}

function matchesExpectedIndex(index, expected) {
  if (indexKey(index) !== JSON.stringify(expected.key)) return false;
  if (expected.options?.unique === true && index.unique !== true) return false;
  if (
    expected.options?.partialFilterExpression
    && JSON.stringify(index.partialFilterExpression) !== JSON.stringify(expected.options.partialFilterExpression)
  ) return false;
  return true;
}

async function auditCollection(collectionName, expected) {
  const collection = mongoose.connection.collection(collectionName);
  let indexes;
  let indexStats;
  try {
    [indexes, indexStats] = await Promise.all([
      collection.listIndexes().toArray(),
      collection.aggregate([{ $indexStats: {} }]).toArray(),
    ]);
  } catch (error) {
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') {
      return { collection: collectionName, missing: expected, indexes: [], indexStats: [] };
    }
    throw error;
  }
  return {
    collection: collectionName,
    missing: expected.filter((expectedIndex) =>
      !indexes.some((index) => matchesExpectedIndex(index, expectedIndex))
    ),
    indexes: indexes.map((index) => ({ name: index.name, key: index.key, unique: index.unique === true, partialFilterExpression: index.partialFilterExpression })),
    indexStats: indexStats.map((index) => ({ name: index.name, accesses: index.accesses })),
  };
}

await mongoose.connect(uri);

try {
  const [audits, duplicateMigrationCodes] = await Promise.all([
    Promise.all(
      Object.entries(expectedIndexes).map(([collectionName, expected]) =>
        auditCollection(collectionName, expected)
      )
    ),
    mongoose.connection.collection('users').aggregate([
      { $match: { role: 'supervisor', migrationCode: { $type: 'string', $gt: '' } } },
      { $group: { _id: '$migrationCode', userIds: { $push: '$_id' }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 20 },
      { $project: { _id: 0, userIds: 1, count: 1 } },
    ]).toArray(),
  ]);
  console.log(JSON.stringify({ mode: 'report', audits, duplicateMigrationCodes }, null, 2));
  if (audits.some((audit) => audit.missing.length > 0) || duplicateMigrationCodes.length > 0) {
    process.exitCode = 2;
  }
} finally {
  await mongoose.disconnect();
}
