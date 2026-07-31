import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const engine = await importTypeScriptModule('lib/finePolicyEngine.ts');

test('calculates each fine method with grace days and a maximum cap', () => {
  const base = {
    deadline: '2026-07-01T12:00:00Z',
    effectiveAt: '2026-07-06T12:00:00Z',
    gracePeriodDays: 1,
    timeZone: 'UTC',
  };
  assert.deepEqual(engine.calculateFine({ ...base, method: 'fixed', fixedAmount: 500 }), {
    originalAmount: 500,
    currentAmount: 500,
    accruedAmount: 0,
    lateDays: 4,
  });
  assert.deepEqual(engine.calculateFine({ ...base, method: 'daily', dailyAmount: 125 }), {
    originalAmount: 0,
    currentAmount: 500,
    accruedAmount: 500,
    lateDays: 4,
  });
  assert.deepEqual(
    engine.calculateFine({
      ...base,
      method: 'starting-plus-daily',
      startingAmount: 300,
      dailyAmount: 100,
      maximumAmount: 550,
    }),
    { originalAmount: 300, currentAmount: 550, accruedAmount: 250, lateDays: 4 }
  );
});

test('excludes paused calendar days without double-counting overlapping pauses', () => {
  const result = engine.calculateFine({
    method: 'daily',
    dailyAmount: 100,
    deadline: '2026-07-01T12:00:00Z',
    effectiveAt: '2026-07-08T12:00:00Z',
    timeZone: 'UTC',
    pausePeriods: [
      { startedAt: '2026-07-03T10:00:00Z', endedAt: '2026-07-06T08:00:00Z' },
      { startedAt: '2026-07-04T10:00:00Z', endedAt: '2026-07-07T08:00:00Z' },
    ],
  });
  assert.deepEqual(result, {
    originalAmount: 0,
    currentAmount: 300,
    accruedAmount: 300,
    lateDays: 3,
  });
});

test('uses the configured time zone for late-day boundaries', () => {
  const result = engine.calculateFine({
    method: 'daily',
    dailyAmount: 100,
    deadline: '2026-07-02T18:30:00Z',
    effectiveAt: '2026-07-02T19:00:00Z',
    timeZone: 'Asia/Karachi',
  });
  assert.equal(result.lateDays, 1);
});

test('keeps an imposed manual amount active before its payment due date', () => {
  const input = {
    method: 'starting-plus-daily',
    startingAmount: 500,
    dailyAmount: 100,
    imposedAmount: 500,
    deadline: '2026-08-15T00:00:00Z',
    effectiveAt: '2026-08-01T00:00:00Z',
    timeZone: 'UTC',
  };
  const result = engine.calculateFine(input);
  assert.deepEqual(result, {
    originalAmount: 500,
    currentAmount: 500,
    accruedAmount: 0,
    lateDays: 0,
  });
  assert.equal(engine.fineStatusForCalculation(result, input), 'pending-payment');
});

test('preserves terminal statuses and validates the status transition graph', () => {
  assert.equal(engine.canTransitionFineStatus('accruing', 'paused'), true);
  assert.equal(engine.canTransitionFineStatus('under-verification', 'paid'), true);
  assert.equal(engine.canTransitionFineStatus('paid', 'accruing'), false);
  assert.throws(
    () => engine.assertFineStatusTransition('waived', 'pending-payment'),
    /cannot change/
  );
  assert.equal(engine.isTerminalFineStatus('cancelled'), true);
});

test('makes no-operational-restriction exclusive', () => {
  assert.deepEqual(engine.normalizeRestrictionSet(['pdf-upload-team', 'pdf-upload-team']), ['pdf-upload-team']);
  assert.throws(
    () => engine.normalizeRestrictionSet(['none', 'login-payment-only']),
    /cannot be combined/
  );
});

test('resolves individual, all-member, and shared-team liability', () => {
  const members = ['student-1', 'student-2'];
  assert.deepEqual(engine.resolveLiabilityShares(members, 'student-1', 'individual'), [
    { studentId: 'student-1', numerator: 1, denominator: 1, index: 0 },
  ]);
  assert.equal(engine.resolveLiabilityShares(members, 'student-1', 'all-members').length, 2);
  assert.deepEqual(engine.resolveLiabilityShares(members, 'student-1', 'shared-team'), [
    { studentId: 'student-1', numerator: 1, denominator: 2, index: 0 },
    { studentId: 'student-2', numerator: 1, denominator: 2, index: 1 },
  ]);
  assert.equal(engine.applyLiabilityShare(501, 1, 2), 251);
  assert.equal(engine.applyLiabilityShare(501, 1, 2, 1), 250);
});

test('previews deadline changes without touching historical terminal fines', () => {
  const preview = engine.previewDeadlineChange(
    [
      {
        id: 'fine-1',
        studentId: 'student-1',
        status: 'accruing',
        currentAmount: 500,
        deadline: '2026-07-01T00:00:00Z',
      },
      {
        id: 'fine-2',
        studentId: 'student-2',
        status: 'paid',
        currentAmount: 900,
        deadline: '2026-07-01T00:00:00Z',
      },
    ],
    { method: 'daily', dailyAmount: 100, timeZone: 'UTC' },
    '2026-07-04T00:00:00Z',
    '2026-07-06T00:00:00Z'
  );
  assert.equal(preview.affectedStudents, 1);
  assert.equal(preview.previousTotalAmount, 500);
  assert.equal(preview.projectedTotalAmount, 200);
  assert.equal(preview.decreases, 1);
  assert.equal(preview.fines.length, 1);
});

test('versions policies and builds stable duplicate-prevention keys', () => {
  assert.equal(engine.nextFinePolicyVersion(undefined), 1);
  assert.equal(engine.nextFinePolicyVersion(4), 5);
  const input = {
    studentId: 'student-1',
    fineTypeId: 'type-1',
    projectStage: 'PROPOSAL',
    policyVersion: 3,
    generationKey: 'bulk-1',
  };
  assert.equal(
    engine.buildFineDeduplicationKey(input),
    engine.buildFineDeduplicationKey({ ...input, generationKey: 'retried-bulk' })
  );
  assert.notEqual(
    engine.buildFineDeduplicationKey(input),
    engine.buildFineDeduplicationKey({ ...input, policyVersion: 4 })
  );
});
