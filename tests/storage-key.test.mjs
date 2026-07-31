import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { getStorageObjectKind, normalizeStorageKey } = await importTypeScriptModule(
  'lib/security/storageKey.ts'
);

test('normalizes canonical object keys and classifies their exact owner collection', () => {
  assert.equal(
    normalizeStorageKey('https://storage.example/proposals/student/upload.pdf'),
    'proposals/student/upload.pdf'
  );
  assert.equal(getStorageObjectKind('proposals/student/upload.pdf'), 'proposal');
  assert.equal(getStorageObjectKind('voicenotes/student/project/upload.webm'), 'voice');
  assert.equal(getStorageObjectKind('broadcasts/supervisor/upload.webm'), 'broadcast');
  assert.equal(getStorageObjectKind('fine-proofs/student/payment-proof'), 'fine-proof');
});

test('rejects encoded traversal, unsafe separators, and oversized object keys', () => {
  assert.equal(normalizeStorageKey('proposals/%252e%252e/secret.pdf'), null);
  assert.equal(normalizeStorageKey('proposals\\student\\upload.pdf'), null);
  assert.equal(normalizeStorageKey(`proposals/${'a'.repeat(501)}`), null);
  assert.equal(getStorageObjectKind('legacy/upload.pdf'), null);
});
