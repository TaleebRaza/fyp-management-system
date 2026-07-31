import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const payment = await importTypeScriptModule('lib/finePaymentEngine.ts');

test('calculates balances after discounts, charges, and prior settlements', () => {
  const fine = {
    id: 'fine-1',
    currentAmount: 1_000,
    settledAmount: 250,
    adjustments: [
      { kind: 'discount', amount: 100 },
      { kind: 'charge', amount: 50 },
    ],
  };
  assert.equal(payment.adjustedFineAmount(fine), 950);
  assert.equal(payment.outstandingFineAmount(fine), 700);
});

test('allocates a payment deterministically and keeps an overpayment unallocated', () => {
  const result = payment.allocateFinePayment(
    [
      { id: 'fine-1', currentAmount: 500 },
      { id: 'fine-2', currentAmount: 300 },
    ],
    900,
    false
  );
  assert.deepEqual(result, {
    outstandingAmount: 800,
    settledAmount: 800,
    unallocatedAmount: 100,
    allocations: [
      { fineId: 'fine-1', amount: 500, remainingBalance: 0 },
      { fineId: 'fine-2', amount: 300, remainingBalance: 0 },
    ],
  });
});

test('rejects an underpayment unless partial settlement is enabled', () => {
  const fines = [{ id: 'fine-1', currentAmount: 500 }];
  assert.throws(() => payment.allocateFinePayment(fines, 200, false), /not enabled/);
  assert.equal(payment.allocateFinePayment(fines, 200, true).allocations[0].remainingBalance, 300);
});
