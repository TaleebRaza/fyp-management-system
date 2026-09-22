import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
const ttlSeconds = 900;
const apply = process.argv.includes('--apply');

if (apply && process.env.CONFIRM_RATE_LIMIT_TTL !== '15-minutes') {
  console.error('Refusing to update the rate-limit TTL. Use --apply with CONFIRM_RATE_LIMIT_TTL=15-minutes.');
  process.exit(1);
}
if (!uri) {
  console.error('MONGODB_URI is required. No database changes were made.');
  process.exit(1);
}

await mongoose.connect(uri);

try {
  const collection = mongoose.connection.collection('ratelimits');
  let indexes = [];
  try {
    indexes = await collection.listIndexes().toArray();
  } catch (error) {
    if (error?.code !== 26 && error?.codeName !== 'NamespaceNotFound') throw error;
  }
  const ttlIndex = indexes.find((index) => index.expireAfterSeconds !== undefined && index.key.createdAt === 1);

  if (apply) {
    if (!ttlIndex) {
      await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: ttlSeconds });
    } else if (ttlIndex.expireAfterSeconds !== ttlSeconds) {
      await mongoose.connection.db.command({
        collMod: 'ratelimits',
        index: { name: ttlIndex.name, expireAfterSeconds: ttlSeconds },
      });
    }
  }

  const actualSeconds = ttlIndex?.expireAfterSeconds ?? null;
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'report',
    collection: 'ratelimits',
    expectedSeconds: ttlSeconds,
    actualSeconds: apply ? ttlSeconds : actualSeconds,
  }, null, 2));
  if (!apply && actualSeconds !== ttlSeconds) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
