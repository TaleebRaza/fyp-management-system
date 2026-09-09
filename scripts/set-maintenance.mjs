import mongoose from 'mongoose';

const operation = process.argv[2];

if (operation !== 'start' && operation !== 'stop') {
  console.error('Usage: node scripts/set-maintenance.mjs <start|stop>');
  process.exit(2);
}

const mongoUri = process.env.MONGODB_URI?.trim();
if (!mongoUri) {
  console.error('MONGODB_URI is required.');
  process.exit(1);
}

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5_000 });
  const database = mongoose.connection.db;
  if (!database) throw new Error('Database connection is unavailable.');

  await database.collection('systemconfigs').updateOne(
    { configKey: 'portal' },
    {
      $set: {
        portalMaintenance: operation === 'start',
        portalMaintenanceReason: 'The portal is temporarily unavailable while a protected maintenance operation is running.',
        updatedAt: new Date(),
      },
      $setOnInsert: { configKey: 'portal', createdAt: new Date() },
    },
    { upsert: true }
  );
  process.stdout.write(`${JSON.stringify({ maintenance: operation === 'start' })}\n`);
} catch {
  console.error('maintenance_state_update_failed');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
