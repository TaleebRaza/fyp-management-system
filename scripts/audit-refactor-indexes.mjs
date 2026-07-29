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
};

function indexKey(index) {
  return JSON.stringify(index.key);
}

async function auditCollection(collectionName, expected) {
  const collection = mongoose.connection.collection(collectionName);
  const [indexes, indexStats] = await Promise.all([
    collection.listIndexes().toArray(),
    collection.aggregate([{ $indexStats: {} }]).toArray(),
  ]);
  const keys = new Set(indexes.map(indexKey));

  return {
    collection: collectionName,
    missing: expected.filter((index) => !keys.has(JSON.stringify(index.key))),
    indexes: indexes.map((index) => ({ name: index.name, key: index.key, unique: index.unique === true, partialFilterExpression: index.partialFilterExpression })),
    indexStats: indexStats.map((index) => ({ name: index.name, accesses: index.accesses })),
  };
}

await mongoose.connect(uri);

try {
  const audits = await Promise.all(
    Object.entries(expectedIndexes).map(([collectionName, expected]) => auditCollection(collectionName, expected))
  );
  console.log(JSON.stringify({ mode: 'report', audits }, null, 2));
} finally {
  await mongoose.disconnect();
}
