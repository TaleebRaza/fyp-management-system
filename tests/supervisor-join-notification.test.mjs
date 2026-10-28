import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const { createSupervisorJoinNotification } = await importTypeScriptModuleWithDependencies('lib/supervisorJoinNotification.ts');
const { default: EmailOutbox } = await importTypeScriptModuleWithDependencies('models/EmailOutbox.ts');

test('a join records student details and safely queues email only for valid opted-in recipients', async () => {
  const original = EmailOutbox.findOneAndUpdate;
  const queued = [];
  EmailOutbox.findOneAndUpdate = async (...args) => { queued.push(args); };
  try {
    const student = { name: 'A <Student>', rollNo: '123', program: 'BSCS', batch: 'Fall 2026' };
    const session = {};
    const notification = await createSupervisorJoinNotification(student, { email: 'SUPERVISOR@example.com' }, session);
    assert.match(notification.message, /A <Student> \(123\).*BSCS.*Fall 2026/);
    assert.equal(queued.length, 1);
    assert.equal(queued[0][1].$setOnInsert.to, 'supervisor@example.com');
    assert.doesNotMatch(queued[0][1].$setOnInsert.html, /Student&gt;|SMOKE001|123/);
    assert.equal(queued[0][2].session, session);
    assert.equal(queued[0][0].dedupeKey, `supervisor-join:${notification._id}`);

    await createSupervisorJoinNotification(student, { email: 'bad address' }, session);
    await createSupervisorJoinNotification(student, { email: 'supervisor@example.com', notificationsEnabled: false }, session);
    assert.equal(queued.length, 1);
  } finally {
    EmailOutbox.findOneAndUpdate = original;
  }
});
