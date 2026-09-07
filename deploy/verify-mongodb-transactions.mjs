import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is required. No database changes were made.');
  process.exit(1);
}

const probeId = `__fyp_portal_transaction_probe_${randomUUID()}`;

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is unavailable.');

  const probes = database.collection('systemconfigs');
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    await probes.insertOne({ _id: probeId, configKey: probeId }, { session });
    await session.commitTransaction();

    if (!await probes.findOne({ _id: probeId })) {
      throw new Error('Committed transaction did not persist its probe.');
    }

    session.startTransaction();
    await probes.insertOne({ _id: `${probeId}-rollback`, configKey: `${probeId}-rollback` }, { session });
    await session.abortTransaction();

    if (await probes.findOne({ _id: `${probeId}-rollback` })) {
      throw new Error('Aborted transaction persisted its probe.');
    }
  } finally {
    if (session.inTransaction()) await session.abortTransaction();
    await session.endSession();
    await probes.deleteOne({ _id: probeId });
  }

  console.log(JSON.stringify({
    connectivity: 'ok',
    transactions: 'commit-and-rollback-verified',
  }));
} catch {
  console.error('mongodb_transaction_validation_failed');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
