import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const {
  buildStorageKey,
  hasExpectedStorageMagic,
} = await importTypeScriptModule('lib/storageValidation.ts');

test('storage keys are derived from the server-controlled owner, kind, and upload id', () => {
  assert.equal(
    buildStorageKey('pdf', 'student-1', 'upload-1'),
    'proposals/student-1/upload-1.pdf'
  );
  assert.equal(
    buildStorageKey('voice', 'student-1', 'upload-1', 'project-1'),
    'voicenotes/student-1/project-1/upload-1.webm'
  );
  assert.equal(
    buildStorageKey('broadcast', 'supervisor-1', 'upload-1'),
    'broadcasts/supervisor-1/upload-1.webm'
  );
  assert.equal(
    buildStorageKey('fine-proof', 'student-1', 'payment-1'),
    'fine-proofs/student-1/payment-1'
  );
  assert.throws(() => buildStorageKey('voice', 'student-1', 'upload-1'));
});

test('storage magic verification rejects claimed MIME types with the wrong bytes', () => {
  assert.equal(hasExpectedStorageMagic('pdf', Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), true);
  assert.equal(hasExpectedStorageMagic('pdf', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), false);
  assert.equal(hasExpectedStorageMagic('voice', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), true);
  assert.equal(hasExpectedStorageMagic('broadcast', Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), false);
  assert.equal(hasExpectedStorageMagic('fine-proof', Uint8Array.from([0xff, 0xd8, 0xff])), true);
  assert.equal(hasExpectedStorageMagic('fine-proof', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasExpectedStorageMagic('fine-proof', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), false);
});
