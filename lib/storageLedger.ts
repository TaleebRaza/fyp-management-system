import type { ClientSession } from 'mongoose';

import SystemConfig from '../models/SystemConfig';

export async function decrementStorageLedger(bytes: number, session?: ClientSession) {
  if (bytes <= 0) return;

  await SystemConfig.findOneAndUpdate(
    { configKey: 'storage' },
    { $inc: { usedBytes: -bytes } },
    { upsert: true, ...(session ? { session } : {}) }
  );
  await SystemConfig.updateOne(
    { configKey: 'storage', usedBytes: { $lt: 0 } },
    { $set: { usedBytes: 0 } },
    session ? { session } : undefined
  );
}
