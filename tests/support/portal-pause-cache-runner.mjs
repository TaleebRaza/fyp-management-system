import assert from 'node:assert/strict';

import mongoose from 'mongoose';

import { importTypeScriptModuleWithDependencies } from './importTypeScript.mjs';

export async function runPortalPauseCacheIntegration(testDatabaseUri) {
  const testDatabase = new URL(testDatabaseUri);
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(testDatabase.hostname)
    || testDatabase.pathname !== '/fyp_portal_pause_test'
  ) {
    throw new Error('PORTAL_PAUSE_TEST_MONGODB_URI must target local database fyp_portal_pause_test.');
  }

  const [{ default: SystemConfig }, { getPortalPause, invalidatePortalPauseCache }] = await Promise.all([
    importTypeScriptModuleWithDependencies('models/SystemConfig.ts'),
    importTypeScriptModuleWithDependencies('lib/portalPause.ts'),
  ]);
  const originalNow = Date.now;
  let now = originalNow();

  try {
    await mongoose.connect(testDatabaseUri);
    await mongoose.connection.dropDatabase();
    await SystemConfig.init();
    await SystemConfig.create({ configKey: 'portal', portalPaused: false, portalPauseReason: 'Open' });

    let configReads = 0;
    mongoose.set('debug', (collection, method) => {
      if (collection === 'systemconfigs' && method === 'findOne') configReads += 1;
    });
    Date.now = () => now;
    const initial = await Promise.all(Array.from({ length: 20 }, () => getPortalPause()));
    assert.ok(initial.every(({ paused }) => paused === false));
    assert.equal(configReads, 1);

    await SystemConfig.updateOne(
      { configKey: 'portal' },
      { $set: { portalPaused: true, portalPauseReason: 'Maintenance' } }
    );
    assert.equal((await getPortalPause()).paused, false);
    assert.equal(configReads, 1);

    invalidatePortalPauseCache();
    assert.deepEqual(await getPortalPause(), { paused: true, reason: 'Maintenance' });
    assert.equal(configReads, 2);

    now += 5_001;
    assert.deepEqual(await getPortalPause(), { paused: true, reason: 'Maintenance' });
    assert.equal(configReads, 3);
  } finally {
    Date.now = originalNow;
    mongoose.set('debug', false);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  }
}
