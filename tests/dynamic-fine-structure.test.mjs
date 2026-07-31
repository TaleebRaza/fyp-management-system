import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dynamic fines use separate collections and database-level duplicate prevention', async () => {
  const [fineType, policy, fine, audit] = await Promise.all([
    read('models/FineType.ts'),
    read('models/FinePolicy.ts'),
    read('models/StudentFine.ts'),
    read('models/FineAudit.ts'),
  ]);
  assert.match(fineType, /defaultRestrictions/);
  assert.match(policy, /fineTypeId: 1, version: 1.*unique: true/s);
  assert.match(fine, /deduplicationKey: \{ type: String, required: true, unique: true/);
  assert.match(fine, /restorationSnapshots/);
  assert.match(audit, /entityType/);
});

test('registration, submission, review, and protected routes use the shared fine services', async () => {
  const [registration, student, review, upload, join, leave, auth] = await Promise.all([
    read('app/api/register/route.ts'),
    read('app/api/dashboard/student/route.ts'),
    read('lib/projectReview.ts'),
    read('app/api/upload/route.ts'),
    read('app/api/project/join/route.ts'),
    read('app/api/project/leave/route.ts'),
    read('lib/security/auth.ts'),
  ]);
  assert.match(registration, /generateLateRegistrationFines/);
  assert.match(student, /generateLateSubmissionFines/);
  assert.match(review, /handleSubmissionReview/);
  assert.match(upload, /getFineActionRestriction/);
  assert.match(join, /getFineActionRestriction/);
  assert.match(leave, /getFineActionRestriction/);
  assert.match(auth, /getStudentFineLoginMode/);
});

test('structural restriction workflow is transactional, auditable, and never deletes storage', async () => {
  const source = await read('lib/fineStructuralRestriction.ts');
  assert.match(source, /previewStructuralFineEnforcement/);
  assert.match(source, /withTransaction/);
  assert.match(source, /restorationSnapshots\.push/);
  assert.match(source, /FineAudit/);
  assert.match(source, /releaseSupervisorProjectSlot/);
  assert.doesNotMatch(source, /DeleteObjectCommand|enqueueStorageDeletion|findByIdAndDelete/);
});
