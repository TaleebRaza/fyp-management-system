import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { createPublicEtag, publicJson } = await importTypeScriptModule('lib/publicResponse.ts');

test('public responses have stable content-based ETags', () => {
  const body = { headline: { text: 'Notice' } };

  assert.equal(createPublicEtag(body), createPublicEtag(body));
  assert.notEqual(createPublicEtag(body), createPublicEtag({ headline: { text: 'Changed' } }));
});

test('public responses return cache headers and honor matching ETags', async () => {
  const body = { headline: { text: 'Notice' } };
  const response = publicJson({ headers: new Headers() }, body);
  const etag = response.headers.get('etag');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60, must-revalidate');
  assert.ok(etag);
  assert.deepEqual(await response.json(), body);

  const cachedResponse = publicJson({ headers: new Headers({ 'if-none-match': etag }) }, body);
  assert.equal(cachedResponse.status, 304);
  assert.equal(cachedResponse.headers.get('etag'), etag);
});
