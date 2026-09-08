import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('operations CLI shares install and fypctl commands without putting bootstrap passwords in flags', async () => {
  const [goModule, install, fypctl, operations] = await Promise.all([
    source('go.mod'),
    source('cmd/install/main.go'),
    source('cmd/fypctl/main.go'),
    source('internal/operations/operations.go'),
  ]);

  assert.match(goModule, /^go 1\.24\.0$/m);
  assert.match(install, /operations\.Run\("install"/);
  assert.match(fypctl, /operations\.Run\("fypctl"/);
  assert.match(operations, /AcquireOperationLock/);
  assert.match(operations, /writeAtomically/);
  assert.match(operations, /--password-stdin/);
  assert.doesNotMatch(operations, /--admin-password/);
});

test('bootstrap is transactionally idempotent and only initializes branding when absent', async () => {
  const [bootstrap, systemConfig, dockerfile, dockerignore] = await Promise.all([
    source('scripts/bootstrap-first-admin.mjs'),
    source('models/SystemConfig.ts'),
    source('Dockerfile'),
    source('.dockerignore'),
  ]);

  assert.match(bootstrap, /session\.withTransaction/);
  assert.match(bootstrap, /configKey: 'bootstrap'/);
  assert.match(bootstrap, /\$setOnInsert/);
  assert.match(bootstrap, /role: 'admin'/);
  assert.match(bootstrap, /bcrypt\.hash/);
  assert.match(systemConfig, /bootstrapAdministratorId/);
  assert.match(dockerfile, /node_modules\/bcryptjs/);
  assert.match(dockerignore, /!scripts\/bootstrap-first-admin\.mjs/);
});
