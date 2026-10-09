import mongoose from 'mongoose';
import { refactorIndexes } from './refactor-indexes.mjs';

const uri = process.env.MONGODB_URI;

if (!process.argv.includes('--apply') || process.env.CONFIRM_INDEX_BUILD !== 'refactor-indexes') {
  console.error('Refusing to build indexes. Use --apply with CONFIRM_INDEX_BUILD=refactor-indexes after reviewing the read-only audit.');
  process.exit(1);
}
if (!uri) {
  console.error('MONGODB_URI is required. No database changes were made.');
  process.exit(1);
}

await mongoose.connect(uri);

try {
  const duplicateMigrationCode = await mongoose.connection.collection('users').aggregate([
    { $match: { role: 'supervisor', migrationCode: { $type: 'string', $gt: '' } } },
    { $group: { _id: '$migrationCode', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ]).next();
  if (duplicateMigrationCode) {
    throw new Error('Duplicate supervisor migration codes must be resolved before index creation.');
  }

  const created = [];
  for (const [collectionName, indexes] of Object.entries(refactorIndexes)) {
    const collection = mongoose.connection.collection(collectionName);
    for (const index of indexes) {
      created.push({
        collection: collectionName,
        name: await collection.createIndex(index.key, index.options),
      });
    }
  }
  // Drop only the superseded ordinary index, after its replacement was built.
  const users = mongoose.connection.collection('users');
  const indexes = await users.listIndexes().toArray();
  const replacement = indexes.find((index) =>
    JSON.stringify(index.key) === JSON.stringify({ role: 1, createdAt: -1, _id: -1 })
    && !index.partialFilterExpression && !index.sparse && !index.hidden && !index.collation
  );
  if (!replacement) throw new Error('Student sort index verification failed; old index retained.');
  const dropped = [];
  for (const index of indexes) {
    if (JSON.stringify(index.key) === JSON.stringify({ role: 1, createdAt: -1 })
      && !index.unique && !index.partialFilterExpression && !index.sparse && !index.collation) {
      await users.dropIndex(index.name);
      dropped.push(index.name);
    }
  }
  console.log(JSON.stringify({ mode: 'apply', created, dropped }, null, 2));
} finally {
  await mongoose.disconnect();
}
