import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const direction = await importTypeScriptModule('lib/studentMessageDirection.ts');

test('message IDs route requests and replies without a new database field', () => {
  const adminId = '507f1f77bcf86cd799439011';
  const supervisorId = '507f191e810c19729de860ea';
  const token = 'c0ffee00-1234-5678-9abc-def012345678';

  const adminRequest = direction.createStudentMessageId('admin', token);
  const supervisorRequest = direction.createStudentMessageId('supervisor', token, supervisorId);
  const supervisorReply = direction.createStaffReplyId('supervisor', supervisorId, token);

  assert.equal(direction.isMessageForStaff(adminRequest, 'admin', adminId), true);
  assert.equal(direction.isMessageForStaff(supervisorRequest, 'supervisor', supervisorId), true);
  assert.equal(direction.isMessageForStaff(supervisorRequest, 'supervisor', adminId), false);
  assert.equal(direction.getStaffReplySenderId(supervisorReply), supervisorId);
  assert.equal(direction.isStaffReply(supervisorReply), true);
  assert.equal(direction.isStaffReply(adminRequest), false);
});

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

test('student API gates roles, recipient assignment, stale IDs, rates, and failed audio cleanup', async () => {
  const [route, upload, direction] = await Promise.all([
    read('app/api/dashboard/student/message/route.ts'),
    read('app/api/voice/upload/route.ts'),
    read('lib/studentMessageDirection.ts'),
  ]);

  assert.match(route, /requireCurrentUser\(req, \['student'\]\)/);
  assert.match(route, /consumeRateLimitDimensions/);
  assert.match(route, /studentMessageId: messageId/);
  assert.match(route, /studentMessageAcknowledgedAt: \{ \$ne: null \}/);
  assert.match(route, /resolveRecipient/);
  assert.match(route, /createStudentMessageId/);
  assert.match(route, /still waiting for a response\./);
  assert.match(route, /cancelUploadReservation\(audioKey/);
  assert.doesNotMatch(route, /DeleteObjectCommand/);
  assert.match(upload, /purpose === 'student-message'/);
  assert.match(upload, /\(messageId\) => buildStorageKey\('student-message'/);
  assert.match(upload, /currentUser\.role !== 'supervisor'/);
  assert.match(route, /isStaffReply\(student\.studentMessageId\)/);
  assert.match(direction, /createStaffReplyId/);
});

test('shared staff inbox authorizes supervisors and adds project details without writing on GET', async () => {
  const route = await read('app/api/dashboard/messages/route.ts');
  const getBody = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'));

  assert.match(getBody, /requireCurrentUser\(req, \['admin', 'supervisor'\]\)/);
  assert.match(getBody, /Cache-Control': 'no-store'/);
  assert.doesNotMatch(getBody, /update|save\(/i);
  assert.match(route, /isMessageForStaff/);
  assert.match(route, /supervisorId: staffUser\.id/);
  assert.match(route, /projectTitle/);
  assert.match(route, /studentMessageId: messageId,/);
  assert.match(route, /studentMessageAcknowledgedAt: \{ \$ne: null \}/);
  assert.match(route, /export async function POST/);
  assert.match(route, /student-message-replied/);
  assert.match(route, /createStaffReplyId\(staffUser\.role, staffUser\.id/);
});

test('storage authorization and audits include current student audio references', async () => {
  const [authorization, references, keyAudit, integrityAudit] = await Promise.all([
    read('lib/security/storage.ts'),
    read('lib/storageReferenceSafety.ts'),
    read('scripts/audit-storage-keys.mjs'),
    read('scripts/audit-storage-integrity.mjs'),
  ]);

  assert.match(authorization, /case 'student-message'/);
  assert.match(authorization, /isMessageForStaff\(student\.studentMessageId, 'supervisor', currentUser\.id\)/);
  assert.match(authorization, /supervisorId: currentUser\.id/);
  assert.match(references, /studentMessageType: 'audio'/);
  assert.match(keyAudit, /prefix: 'student-messages\/'/);
  assert.match(integrityAudit, /addReference\('student-message'/);
});

test('student and staff UIs preserve the recipient, acknowledgement, reply, and project navigation contracts', async () => {
  const [dashboard, widget, adminDashboard, supervisorDashboard, panel, recorder] = await Promise.all([
    read('components/dashboards/StudentDashboard.tsx'),
    read('components/student/StudentMessageWidget.tsx'),
    read('components/dashboards/AdminDashboard.tsx'),
    read('components/dashboards/SupervisorDashboard.tsx'),
    read('components/messages/StudentMessagesPanel.tsx'),
    read('components/broadcast/hooks/useAudioRecorder.ts'),
  ]);

  assert.equal((dashboard.match(/<StudentMessageWidget/g) || []).length, 1);
  assert.ok(dashboard.indexOf('<StudentMessageWidget') > dashboard.indexOf('</DashboardShell>'));
  assert.match(widget, /useAudioRecorder\(\)/);
  assert.match(widget, /hasAssignedSupervisor/);
  assert.match(widget, /recipient: activeRecipient/);
  assert.match(widget, /!message \|\| message\.isStaffReply \|\| Boolean\(message\.acknowledgedAt\)/);
  assert.match(widget, /purpose: 'student-message'/);
  assert.match(widget, /message\.isStaffReply/);
  assert.match(recorder, /return APP_SETTINGS\.STUDENT_MESSAGE\.MAX_AUDIO_SECONDS;/);
  assert.match(adminDashboard, /activeTab === 'messages'/);
  assert.match(supervisorDashboard, /label: 'Student Messages'/);
  assert.match(supervisorDashboard, /onOpenProject=\{openMessageProject\}/);
  assert.match(supervisorDashboard, /scrollIntoView/);
  assert.match(panel, /studentMessageType !== 'text'/);
  assert.match(panel, /onEnded=\{\(\) => void acknowledge\(selected\)\}/);
  assert.doesNotMatch(panel, /onPlay=.*acknowledge/);
  assert.match(panel, /message\.projectTitle/);
  assert.match(panel, /Reply to student/);
  assert.match(panel, /Send reply/);
});
