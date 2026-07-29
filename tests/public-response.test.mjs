import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { createPublicEtag } = await importTypeScriptModule('lib/publicEtag.ts');

test('public responses have stable content-based ETags', () => {
  const body = { headline: { text: 'Notice' } };

  assert.equal(createPublicEtag(body), createPublicEtag(body));
  assert.notEqual(createPublicEtag(body), createPublicEtag({ headline: { text: 'Changed' } }));
});
