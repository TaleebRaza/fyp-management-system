import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('fine payments are separate, idempotent, auditable records', async () => {
  const [payment, audit, fine] = await Promise.all([
    read('models/FinePayment.ts'),
    read('models/FineAudit.ts'),
    read('models/StudentFine.ts'),
  ]);
  assert.match(payment, /studentId: 1, idempotencyKey: 1.*unique: true/s);
  assert.match(payment, /allocations/);
  assert.match(payment, /proofKey/);
  assert.match(audit, /payment-record/);
  assert.match(fine, /settledAmount/);
  assert.match(fine, /adjustments/);
});

test('clearance and restoration are transactional and never delete stored objects', async () => {
  const [service, route] = await Promise.all([
    read('lib/dynamicFinePayment.ts'),
    read('app/api/admin/fine-system/route.ts'),
  ]);
  assert.match(service, /verifyFinePayment/);
  assert.match(service, /withTransaction/);
  assert.match(service, /allocateFinePayment/);
  assert.match(service, /status: \{ \$in: \['submitted', 'under-verification'\] \}[\s\S]*fineIds: \{ \$in: fineIds \}/);
  assert.match(service, /recordOfflinePayment[\s\S]*withTransaction[\s\S]*createPaymentSubmission[\s\S]*verifyFinePaymentInSession/);
  assert.match(service, /unselectedFineIds[\s\S]*pending-payment/);
  assert.match(service, /previewFineRestoration/);
  assert.match(service, /reserveSupervisorProjectSlot/);
  assert.doesNotMatch(service, /DeleteObjectCommand|enqueueStorageDeletion|deleteMany|findByIdAndDelete/);
  assert.match(route, /previewPaymentClearance/);
  assert.match(route, /verifyPaymentAndClear/);
  assert.match(route, /body\.confirm !== true/);
});

test('payment proof uses the existing storage reservation protocol and isolated access checks', async () => {
  const [upload, studentRoute, access, audit] = await Promise.all([
    read('app/api/fines/payment-proof/route.ts'),
    read('app/api/fines/route.ts'),
    read('lib/security/storage.ts'),
    read('scripts/audit-storage-integrity.mjs'),
  ]);
  assert.match(upload, /reserveUpload/);
  assert.match(studentRoute, /finalizeUploadReservation/);
  assert.match(access, /canAccessFineProof/);
  assert.match(audit, /fine-payment-proof/);
  assert.doesNotMatch(upload, /DeleteObjectCommand/);
  assert.doesNotMatch(studentRoute, /DeleteObjectCommand|enqueueStorageDeletion/);
});
