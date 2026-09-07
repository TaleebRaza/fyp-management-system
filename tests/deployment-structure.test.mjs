import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('standalone image includes the application and supported maintenance commands', async () => {
  const [nextConfig, dockerfile, dockerignore, packageJson] = await Promise.all([
    source('next.config.ts'),
    source('Dockerfile'),
    source('.dockerignore'),
    source('package.json'),
  ]);

  assert.match(nextConfig, /output:\s*['"]standalone['"]/);
  assert.match(dockerfile, /FROM .+ AS dependencies/i);
  assert.match(dockerfile, /FROM .+ AS builder/i);
  assert.match(dockerfile, /FROM .+ AS runtime/i);
  assert.match(dockerfile, /USER portal/);
  assert.match(dockerfile, /\/app\/\.next\/standalone/);
  assert.match(dockerfile, /\/app\/scripts \.\/scripts/);
  assert.match(dockerignore, /scripts\/\*/);
  assert.match(dockerignore, /!scripts\/audit-storage-integrity\.mjs/);
  assert.match(packageJson, /"mongo:verify"/);
});

test('local MongoDB is authenticated, persistent, initialized as a replica set, and private', async () => {
  const compose = await source('deploy/compose.local-mongodb.yaml');

  assert.match(compose, /--auth/);
  assert.match(compose, /--replSet", "rs0/);
  assert.match(compose, /MONGO_INITDB_ROOT_USERNAME/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /type: bind/);
  assert.match(compose, /\/var\/lib\/fyp-portal\/mongodb/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
});

test('health routes bypass authentication middleware and readiness pings MongoDB', async () => {
  const [proxy, liveness, readiness] = await Promise.all([
    source('proxy.ts'),
    source('app/api/health/live/route.ts'),
    source('app/api/health/ready/route.ts'),
  ]);

  assert.match(proxy, /api\/health/);
  assert.match(liveness, /status: 'ok'/);
  assert.match(readiness, /connectToDatabase/);
  assert.match(readiness, /admin\(\)\.command\(\{ ping: 1 \}\)/);
  assert.match(readiness, /status: 503/);
});

test('the MongoDB verification probe proves commit and rollback without retaining data', async () => {
  const probe = await source('deploy/verify-mongodb-transactions.mjs');

  assert.match(probe, /session\.commitTransaction\(\)/);
  assert.match(probe, /session\.abortTransaction\(\)/);
  assert.match(probe, /await probes\.deleteOne\(\{ _id: probeId \}\)/);
  assert.match(probe, /mongodb_transaction_validation_failed/);
});
