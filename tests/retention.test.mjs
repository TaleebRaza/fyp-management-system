import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const retention = await importTypeScriptModule('types/retention.ts');

function settings(overrides = {}) {
  return {
    schedule: { ...retention.DEFAULT_RETENTION_SETTINGS.schedule },
    playedVoiceNotes: { ...retention.DEFAULT_RETENTION_SETTINGS.playedVoiceNotes },
    unplayedVoiceNotes: { ...retention.DEFAULT_RETENTION_SETTINGS.unplayedVoiceNotes },
    audioBroadcasts: { ...retention.DEFAULT_RETENTION_SETTINGS.audioBroadcasts },
    unusedPdfUploads: { ...retention.DEFAULT_RETENTION_SETTINGS.unusedPdfUploads },
    ...overrides,
  };
}

test('new retention defaults preserve content unless its category is explicitly enabled', () => {
  const parsed = retention.parseRetentionSettings(settings());

  assert.equal(parsed.schedule.time, '02:00');
  assert.equal(parsed.playedVoiceNotes.ageDays, 7);
  assert.equal(parsed.playedVoiceNotes.enabled, true);
  assert.equal(parsed.unplayedVoiceNotes.enabled, false);
  assert.equal(parsed.audioBroadcasts.enabled, false);
  assert.equal(parsed.unusedPdfUploads.enabled, true);
});

test('retention rejects malformed schedules and only becomes due after its local daily time', () => {
  assert.throws(
    () => retention.parseRetentionSettings(settings({ schedule: { enabled: true, timezone: 'invalid/zone', time: '02:00' } })),
    /timezone/
  );
  assert.throws(
    () => retention.parseRetentionSettings(settings({ playedVoiceNotes: { enabled: true, ageDays: 0 } })),
    /age/
  );

  const utcSchedule = retention.parseRetentionSettings(settings({
    schedule: { enabled: true, timezone: 'UTC', time: '02:00' },
  }));
  assert.equal(retention.getRetentionScheduleKey(utcSchedule, new Date('2026-09-08T01:59:00Z')), null);
  assert.equal(retention.getRetentionScheduleKey(utcSchedule, new Date('2026-09-08T02:00:00Z')), '2026-09-08');
});

test('retention uses bounded durable deletion work without touching student/admin message acknowledgements', async () => {
  const [retentionSource, essentialRoute, retentionRoute, systemConfig, reservation, runner, operations] = await Promise.all([
    source('lib/retention.ts'),
    source('app/api/cron/essential/route.ts'),
    source('app/api/cron/retention/route.ts'),
    source('models/SystemConfig.ts'),
    source('models/UploadReservation.ts'),
    source('scripts/run-background-operation.mjs'),
    source('internal/operations/operations.go'),
  ]);

  assert.match(retentionSource, /RETENTION_BATCH_LIMIT/);
  assert.match(retentionSource, /findSharedStorageKeys/);
  assert.match(retentionSource, /enqueueStorageDeletion/);
  assert.match(retentionSource, /retentionRunLockedUntil/);
  assert.match(retentionSource, /playedAt/);
  assert.doesNotMatch(retentionSource, /studentMessageAcknowledgedAt/);
  assert.match(systemConfig, /retentionSettings/);
  assert.match(reservation, /retentionCleanupQueuedAt/);
  assert.match(essentialRoute, /processEssentialBackgroundWork/);
  assert.match(retentionRoute, /processConfiguredRetention/);
  assert.match(runner, /Authorization: `Bearer \$\{cronSecret\}`/);
  assert.match(operations, /runBackgroundJob/);
  assert.match(operations, /runTimers/);
});
