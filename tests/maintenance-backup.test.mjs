import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('maintenance blocks every application mutation and makes Caddy return its maintenance page', async () => {
  const [proxy, portalPause, systemConfig, gateway, caddy, localCaddy] = await Promise.all([
    source('proxy.ts'),
    source('lib/portalPause.ts'),
    source('models/SystemConfig.ts'),
    source('deploy/compose.gateway.yaml'),
    source('deploy/Caddyfile'),
    source('deploy/Caddyfile.local-storage'),
  ]);

  assert.match(proxy, /portal\?\.maintenance/);
  assert.match(proxy, /PORTAL_MAINTENANCE/);
  assert.match(proxy, /!\['GET', 'HEAD', 'OPTIONS'\]\.includes\(req\.method\)/);
  assert.doesNotMatch(proxy, /portal\?\.maintenance[\s\S]{0,250}role !== 'admin'/);
  assert.match(portalPause, /maintenance: boolean/);
  assert.match(systemConfig, /portalMaintenance/);
  assert.match(gateway, /FYP_STATE_DIR/);
  for (const config of [caddy, localCaddy]) {
    assert.match(config, /@maintenance file \/var\/lib\/fyp-portal\/state\/maintenance\.json/);
    assert.match(config, /maintenance\.html/);
    assert.match(config, /status 503/);
    assert.match(config, /handle @health/);
  }
});

test('backup and restore use protected key input, integrity checks, and clean targets', async () => {
  const [operations, backupScript, dockerfile, dockerignore, backupService] = await Promise.all([
    source('internal/operations/backup.go'),
    source('scripts/backup-application-data.mjs'),
    source('Dockerfile'),
    source('.dockerignore'),
    source('deploy/systemd/fyp-portal-backup.service'),
  ]);

  assert.match(operations, /FYP_BACKUP_RECOVERY_KEY/);
  assert.match(operations, /--recovery-key-stdin/);
  assert.match(operations, /RESTORE_INTO_EMPTY_DESTINATION/);
  assert.match(operations, /verifyBackupArchive/);
  assert.match(operations, /maintenance mode remains active/);
  assert.match(operations, /pruneBackups/);
  assert.match(operations, /backup schedule requires daily/);
  assert.match(backupScript, /EJSON\.stringify/);
  assert.match(backupScript, /ListObjectsV2Command/);
  assert.match(backupScript, /GetObjectCommand/);
  assert.match(backupScript, /PutObjectCommand/);
  assert.match(backupScript, /Restore requires an empty MongoDB database/);
  assert.match(backupScript, /Restore requires an empty storage bucket/);
  assert.match(dockerfile, /COPY --from=builder --chown=portal:portal \/app\/scripts \.\/scripts/);
  assert.match(dockerignore, /!scripts\/backup-application-data\.mjs/);
  assert.match(dockerignore, /!scripts\/set-maintenance\.mjs/);
  assert.match(backupService, /fypctl backup create --scheduled/);
});
