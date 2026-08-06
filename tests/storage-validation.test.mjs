import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const {
  buildStorageKey,
  getStorageObjectKind,
  hasExpectedStorageMagic,
  isOwnedVoiceKey,
  normalizeStorageKey,
} = await importTypeScriptModule('lib/storageValidation.ts');

test('normalizes canonical object keys and classifies their exact owner collection', () => {
  assert.equal(
    normalizeStorageKey('https://storage.example/proposals/student/upload.pdf'),
    'proposals/student/upload.pdf'
  );
  assert.equal(getStorageObjectKind('proposals/student/upload.pdf'), 'proposal');
  assert.equal(getStorageObjectKind('voicenotes/student/project/upload.webm'), 'voice');
  assert.equal(getStorageObjectKind('broadcasts/supervisor/upload.webm'), 'broadcast');
  assert.equal(isOwnedVoiceKey('voicenotes/student/project/upload.webm', 'student', 'project'), true);
  assert.equal(isOwnedVoiceKey('voicenotes/other/project/upload.webm', 'student', 'project'), false);
});

test('rejects encoded traversal, unsafe separators, and oversized object keys', () => {
  assert.equal(normalizeStorageKey('proposals/%252e%252e/secret.pdf'), null);
  assert.equal(normalizeStorageKey('proposals\\student\\upload.pdf'), null);
  assert.equal(normalizeStorageKey(`proposals/${'a'.repeat(501)}`), null);
  assert.equal(getStorageObjectKind('legacy/upload.pdf'), null);
});

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
  assert.throws(() => buildStorageKey('voice', 'student-1', 'upload-1'));
});

test('storage magic verification rejects claimed MIME types with the wrong bytes', () => {
  assert.equal(hasExpectedStorageMagic('pdf', Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), true);
  assert.equal(hasExpectedStorageMagic('pdf', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), false);
  assert.equal(hasExpectedStorageMagic('voice', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), true);
  assert.equal(hasExpectedStorageMagic('broadcast', Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d])), false);
});
