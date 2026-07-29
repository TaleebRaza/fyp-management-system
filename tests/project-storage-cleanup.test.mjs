import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { collectStorageDeletionTargets } = await importTypeScriptModule(
  'lib/storageDeletionTargets.ts'
);

test('project cleanup normalizes, deduplicates, and keeps the largest known size', () => {
  assert.deepEqual(
    collectStorageDeletionTargets([
      { key: 'https://storage.example/proposals/student/file.pdf', bytes: 100 },
      { key: 'proposals/student/file.pdf', bytes: 120 },
      { key: 'voicenotes/student/note.webm', bytes: 25 },
    ]),
    [
      { key: 'proposals/student/file.pdf', bytes: 120 },
      { key: 'voicenotes/student/note.webm', bytes: 25 },
    ]
  );
});

test('project cleanup rejects unsafe keys and treats untrusted sizes conservatively', () => {
  assert.deepEqual(
    collectStorageDeletionTargets([
      { key: 'proposals/%252e%252e/secret.pdf', bytes: 100 },
      { key: 'proposals/student/file.pdf', bytes: -1 },
      { key: 'voicenotes/student/note.webm', bytes: 3.5 },
    ]),
    [
      { key: 'proposals/student/file.pdf', bytes: 0 },
      { key: 'voicenotes/student/note.webm', bytes: 0 },
    ]
  );
});
