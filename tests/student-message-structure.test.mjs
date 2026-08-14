import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('student messages use one current User record and bounded shared settings', async () => {
  const [settings, user, reservation, indexes] = await Promise.all([
    read('config/appSettings.ts'),
    read('models/User.ts'),
    read('models/UploadReservation.ts'),
    read('scripts/refactor-indexes.mjs'),
  ]);

  for (const field of [
    'studentMessageId',
    'studentMessageType',
    'studentMessageContent',
    'studentMessageSize',
    'studentMessageCreatedAt',
    'studentMessageAcknowledgedAt',
  ]) assert.match(user, new RegExp(field));
  assert.match(settings, /MAX_TEXT_LENGTH: 500/);
  assert.match(settings, /MAX_AUDIO_SECONDS: 60/);
  assert.match(settings, /MAX_AUDIO_BYTES: 1024 \* 1024/);
  assert.match(reservation, /'student-message'/);
  assert.match(reservation, /partialFilterExpression: \{ kind: 'student-message', state: 'pending' \}/);
  assert.match(indexes, /studentMessageCreatedAt: -1/);
});

test('student API gates roles, stale IDs, pending replacement, rates, and failed audio cleanup', async () => {
  const [route, upload] = await Promise.all([
    read('app/api/dashboard/student/message/route.ts'),
    read('app/api/voice/upload/route.ts'),
  ]);

  assert.match(route, /requireCurrentUser\(req, \['student'\]\)/);
  assert.match(route, /consumeRateLimitDimensions/);
  assert.match(route, /studentMessageId: messageId/);
  assert.match(route, /studentMessageAcknowledgedAt: \{ \$ne: null \}/);
  assert.match(route, /still waiting for the admin\./);
  assert.match(route, /cancelUploadReservation\(audioKey/);
  assert.doesNotMatch(route, /DeleteObjectCommand/);
  assert.match(upload, /purpose === 'student-message'/);
  assert.match(upload, /\(messageId\) => buildStorageKey\('student-message'/);
});

test('admin GET is read-only and acknowledgement is exact and idempotent', async () => {
  const route = await read('app/api/admin/student-messages/route.ts');
  const getBody = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function PATCH'));

  assert.match(getBody, /requireCurrentUser\(req, \['admin'\]\)/);
  assert.match(getBody, /Cache-Control': 'no-store'/);
  assert.doesNotMatch(getBody, /update|save\(/i);
  assert.match(route, /studentMessageId: messageId,\s+studentMessageAcknowledgedAt: null/);
  assert.match(route, /studentMessageAcknowledgedAt: \{ \$ne: null \}/);
});

test('storage authorization and audits include current student audio references', async () => {
  const [authorization, references, keyAudit, integrityAudit] = await Promise.all([
    read('lib/security/storage.ts'),
    read('lib/storageReferenceSafety.ts'),
    read('scripts/audit-storage-keys.mjs'),
    read('scripts/audit-storage-integrity.mjs'),
  ]);

  assert.match(authorization, /case 'student-message'/);
  assert.match(authorization, /currentUser\.role === 'admin' \|\| currentUser\.id === student\._id\.toString\(\)/);
  assert.match(references, /studentMessageType: 'audio'/);
  assert.match(keyAudit, /prefix: 'student-messages\/'/);
  assert.match(integrityAudit, /addReference\('student-message'/);
});

test('student and admin UIs preserve the acknowledgement contract', async () => {
  const [dashboard, widget, adminDashboard, panel, recorder] = await Promise.all([
    read('components/dashboards/StudentDashboard.tsx'),
    read('components/student/StudentMessageWidget.tsx'),
    read('components/dashboards/AdminDashboard.tsx'),
    read('components/admin/StudentMessagesPanel.tsx'),
    read('components/broadcast/hooks/useAudioRecorder.ts'),
  ]);

  assert.equal((dashboard.match(/<StudentMessageWidget/g) || []).length, 1);
  assert.ok(dashboard.indexOf('<StudentMessageWidget') > dashboard.indexOf('</DashboardShell>'));
  assert.match(widget, /useAudioRecorder\(\)/);
  assert.match(widget, /!message \|\| Boolean\(message\.acknowledgedAt\)/);
  assert.match(widget, /purpose: 'student-message'/);
  assert.match(recorder, /return APP_SETTINGS\.STUDENT_MESSAGE\.MAX_AUDIO_SECONDS;/);
  assert.match(adminDashboard, /activeTab === 'messages'/);
  assert.match(panel, /studentMessageType !== 'text'/);
  assert.match(panel, /onEnded=\{\(\) => void acknowledge\(selected\)\}/);
  assert.doesNotMatch(panel, /onPlay=.*acknowledge/);
});
