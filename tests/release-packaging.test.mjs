import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('release packaging uses a digest-pinned image and a curated installer archive', async () => {
  const [packager, notices, workflow, compose, localStorage, operations, installer] = await Promise.all([
    source('scripts/package-release.mjs'),
    source('scripts/generate-third-party-notices.mjs'),
    source('.github/workflows/release.yml'),
    source('deploy/compose.yaml'),
    source('deploy/compose.local-storage.yaml'),
    source('internal/operations/release.go'),
    source('internal/operations/install.go'),
  ]);

  assert.match(packager, /release-manifest\.json/);
  assert.match(packager, /SHA256SUMS/);
  assert.match(packager, /THIRD_PARTY_NOTICES\.md/);
  assert.match(packager, /--sort=name/);
  assert.match(notices, /node_modules is required/);
  assert.match(workflow, /packages: write/);
  assert.match(workflow, /attestations: write/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /docker\/build-push-action@/);
  assert.match(workflow, /actions\/attest@v4/);
  assert.match(compose, /FYP_PORTAL_IMAGE:\?FYP_PORTAL_IMAGE is required/);
  assert.match(compose, /pull_policy: always/);
  assert.doesNotMatch(compose, /^\s+build:/m);
  assert.match(localStorage, /FYP_PORTAL_IMAGE:\?FYP_PORTAL_IMAGE is required/);
  assert.doesNotMatch(localStorage, /storage-init:\n\s+build:/);
  assert.match(operations, /verifyReleasePayload/);
  assert.match(operations, /@sha256:/);
  assert.match(installer, /FYP_PORTAL_IMAGE/);
  assert.doesNotMatch(installer, /up", "--build"/);
});
