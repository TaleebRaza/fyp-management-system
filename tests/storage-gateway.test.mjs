import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  getLocalStorageConfiguration,
  localStorageCorsConfiguration,
} from '../deploy/initialize-local-storage.mjs';
import {
  assertCorsPreflight,
  verifyBrowserStorage,
} from '../deploy/verify-browser-storage.mjs';

const source = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const localStorageEnvironment = {
  PORTAL_PUBLIC_URL: 'https://portal.example.edu',
  S3_ENDPOINT: 'http://seaweedfs:8333',
  S3_BROWSER_ENDPOINT: 'https://portal.example.edu',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'localaccesskey1234',
  S3_SECRET_ACCESS_KEY: 'local-secret-key',
  S3_BUCKET_NAME: 'fyp-uploads',
  S3_FORCE_PATH_STYLE: 'true',
};

test('local storage only initializes the private SeaweedFS endpoint and signed upload bucket', () => {
  const { configuration, portalOrigin } = getLocalStorageConfiguration(localStorageEnvironment);

  assert.equal(configuration.endpoint, 'http://seaweedfs:8333');
  assert.equal(portalOrigin, 'https://portal.example.edu');
  assert.deepEqual(localStorageCorsConfiguration(portalOrigin), {
    CORSRules: [{
      AllowedOrigins: ['https://portal.example.edu'],
      AllowedMethods: ['GET', 'HEAD', 'PUT'],
      AllowedHeaders: ['content-type'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 600,
    }],
  });
  assert.throws(
    () => getLocalStorageConfiguration({ ...localStorageEnvironment, S3_ENDPOINT: 'https://storage.example.edu' }),
    /S3_ENDPOINT=http:\/\/seaweedfs:8333/
  );
});

test('browser storage validation requires false-data confirmation and a usable CORS preflight', async () => {
  const validResponse = {
    ok: true,
    status: 204,
    headers: new Headers({
      'access-control-allow-origin': 'https://portal.example.edu',
      'access-control-allow-methods': 'GET, PUT',
      'access-control-allow-headers': 'content-type',
    }),
  };

  assert.doesNotThrow(() => assertCorsPreflight(validResponse, 'https://portal.example.edu'));
  assert.throws(
    () => assertCorsPreflight({ ...validResponse, headers: new Headers() }, 'https://portal.example.edu'),
    /does not allow the portal origin/
  );
  await assert.rejects(
    () => verifyBrowserStorage({}),
    /FYP_STORAGE_VALIDATION_CONFIRM=LOCAL_FALSE_DATA/
  );
});

test('the local gateway preserves signed upload URLs and keeps management services private', async () => {
  const [gateway, localGateway, localStorage, dockerfile] = await Promise.all([
    source('deploy/compose.gateway.yaml'),
    source('deploy/Caddyfile.local-storage'),
    source('deploy/compose.local-storage.yaml'),
    source('Dockerfile'),
  ]);

  assert.match(gateway, /caddy:2\.11\.4-alpine@sha256:5f5c8640/);
  assert.match(gateway, /FYP_CADDY_DATA_DIR/);
  assert.match(localGateway, /admin off/);
  assert.match(localGateway, /path \/fyp-uploads \/fyp-uploads\/\*/);
  assert.match(localGateway, /reverse_proxy seaweedfs:8333/);
  assert.doesNotMatch(localGateway, /handle_path|\buri\b/);
  assert.match(localStorage, /chrislusf\/seaweedfs:4\.42@sha256:f7cbc8bdbbf60/);
  assert.match(localStorage, /service_completed_successfully/);
  assert.doesNotMatch(localStorage, /^\s*ports:/m);
  assert.match(dockerfile, /deploy\/initialize-local-storage\.mjs/);
  assert.match(dockerfile, /deploy\/verify-browser-storage\.mjs/);
});
