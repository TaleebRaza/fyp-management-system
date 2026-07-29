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
  console.log(JSON.stringify({ mode: 'apply', created }, null, 2));
} finally {
  await mongoose.disconnect();
}
