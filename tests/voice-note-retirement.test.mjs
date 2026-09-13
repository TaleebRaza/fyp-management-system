import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

test('project voice notes are retired without disrupting chat audio uploads', async () => {
  const [studentTeam, projectDialog, supervisorDashboard, upload, protocol, storage] = await Promise.all([
    read('components/student/StudentTeamSection.tsx'),
    read('components/supervisor/SupervisorProjectDialog.tsx'),
    read('components/dashboards/SupervisorDashboard.tsx'),
    read('app/api/voice/upload/route.ts'),
    read('lib/storageProtocol.ts'),
    read('lib/security/storage.ts'),
  ]);

  assert.doesNotMatch(studentTeam, /Voice Workspace|VoiceChat/);
  assert.doesNotMatch(projectDialog, /Voice Notes|VoiceChat/);
  assert.doesNotMatch(supervisorDashboard, /voiceNotes=/);
  assert.match(upload, /Project-scoped audio uploads are no longer supported/);
  assert.match(upload, /purpose === 'student-message'/);
  assert.doesNotMatch(upload, /isVoiceNote|kind === 'voice'|hasProjectAccess/);
  assert.doesNotMatch(protocol, /VoiceNote|MAX_VOICE_NOTES_PER_SENDER/);
  assert.doesNotMatch(storage, /VoiceNote|case 'voice'/);

  await assert.rejects(access(new URL('app/api/voice/route.ts', root)), { code: 'ENOENT' });
  await assert.rejects(access(new URL('components/ui/VoiceChat.tsx', root)), { code: 'ENOENT' });
});

test('storage no longer creates project voice keys', async () => {
  const { buildStorageKey, getStorageObjectKind } = await importTypeScriptModule('lib/storageValidation.ts');

  assert.equal(getStorageObjectKind('voicenotes/student/project/upload.webm'), null);
  assert.throws(() => buildStorageKey('voice', 'student', 'upload'));
});
