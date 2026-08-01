import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCollectedFineSummary,
  COLLECTED_STUDENT_FINE_FILTER,
  OUTSTANDING_STUDENT_FINE_FILTER,
} from '../lib/fineRestriction.ts';

test('fine queries exclude deactivated students', () => {
  assert.deepEqual(OUTSTANDING_STUDENT_FINE_FILTER.isActive, { $ne: false });
  assert.deepEqual(COLLECTED_STUDENT_FINE_FILTER.isActive, { $ne: false });
});

test('collected fine summary includes only resolved monetary fines', () => {
  assert.deepEqual(
    buildCollectedFineSummary({
      lateRegistrationFine: 500,
      lateRegistrationDays: 2,
      lateRegistrationFineStatus: 'resolved',
      registrationPunishment: {
        active: true,
        category: 'fine',
        amount: 750,
        title: 'Late reopening fine',
        status: 'resolved',
      },
    }),
    {
      lateRegistrationFine: { amount: 500, daysLate: 2 },
      adminFine: { amount: 750, title: 'Late reopening fine' },
      totalAmount: 1250,
    }
  );
});

test('collected fine summary excludes pending and waived fines', () => {
  assert.equal(
    buildCollectedFineSummary({
      lateRegistrationFine: 500,
      lateRegistrationFineStatus: 'waived',
      registrationPunishment: {
        active: true,
        category: 'fine',
        amount: 750,
        status: 'pending',
      },
    }),
    null
  );
});
