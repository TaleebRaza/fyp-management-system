import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCollectedFineSummary } from '../lib/fineRestriction.ts';

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
