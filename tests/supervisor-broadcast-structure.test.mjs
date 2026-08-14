import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('supervisor voice broadcasts use the server-supported WebM format below the upload limit', async () => {
  const recorder = await read('components/broadcast/hooks/useAudioRecorder.ts');

  assert.match(recorder, /const BROADCAST_MIME_TYPE = APP_SETTINGS\.STUDENT_MESSAGE\.AUDIO_CONTENT_TYPE;/);
  assert.match(recorder, /audioBitsPerSecond: BROADCAST_AUDIO_BIT_RATE/);
  assert.match(recorder, /const BROADCAST_AUDIO_BIT_RATE = 16_000;/);
  assert.match(recorder, /APP_SETTINGS\.STUDENT_MESSAGE\.MAX_AUDIO_SECONDS/);
});

test('supervisor broadcasts replace the active record and retain publish errors', async () => {
  const [route, submit] = await Promise.all([
    read('app/api/dashboard/supervisor/broadcast/route.ts'),
    read('components/broadcast/hooks/useBroadcastSubmit.ts'),
  ]);

  assert.match(
    route,
    /await enqueueCurrentBroadcastDeletion\(supervisor, session\);\s+supervisor\.broadcastType = 'text';\s+supervisor\.broadcastContent = text;\s+supervisor\.broadcastSize = 0;\s+supervisor\.broadcastCreatedAt = new Date\(\);\s+await supervisor\.save\(\{ session \}\);/
  );
  assert.match(
    route,
    /await enqueueCurrentBroadcastDeletion\(supervisor, session\);\s+supervisor\.broadcastType = 'audio';\s+supervisor\.broadcastContent = key;\s+supervisor\.broadcastSize = uploadedObject\.actualBytes;\s+supervisor\.broadcastCreatedAt = new Date\(\);\s+await supervisor\.save\(\{ session \}\);/
  );
  assert.match(submit, /throw new Error\(data\.error \|\| 'Failed to save broadcast\.'\);/);
});
