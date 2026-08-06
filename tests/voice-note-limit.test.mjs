import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const { APP_SETTINGS } = await importTypeScriptModule('config/appSettings.ts');

test('voice notes reserve three sender slots per project and release one when deleted', async () => {
  const [protocol, route, chat, quota] = await Promise.all([
    read('lib/storageProtocol.ts'),
    read('app/api/voice/route.ts'),
    read('components/ui/VoiceChat.tsx'),
    read('models/VoiceNoteQuota.ts'),
  ]);

  assert.equal(APP_SETTINGS.MAX_VOICE_NOTES_PER_SENDER, 3);
  assert.match(protocol, /APP_SETTINGS\.MAX_VOICE_NOTES_PER_SENDER/);
  assert.match(protocol, /count: \{ \$lt: APP_SETTINGS\.MAX_VOICE_NOTES_PER_SENDER \}/);
  assert.match(protocol, /releaseVoiceNoteSlot/);
  assert.match(quota, /VoiceNoteQuotaSchema\.index\(\{ ownerId: 1, projectId: 1 \}, \{ unique: true \}\)/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /senderId: currentUser\.id/);
  assert.match(route, /enqueueStorageDeletion/);
  assert.match(chat, /Delete this voice note/);
  assert.match(chat, /hasReachedVoiceNoteLimit/);
});
