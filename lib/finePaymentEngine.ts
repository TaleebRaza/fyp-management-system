export type FineBalance = {
  id: string;
  currentAmount: number;
  settledAmount?: number;
  adjustments?: Array<{ kind: 'discount' | 'charge'; amount: number }>;
};

export type PaymentAllocation = {
  fineId: string;
  amount: number;
  remainingBalance: number;
};

function money(value: unknown) {
  const amount = Math.round(Number(value));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function adjustedFineAmount(fine: FineBalance) {
  const adjustment = (fine.adjustments || []).reduce(
    (total, item) => total + (item.kind === 'charge' ? money(item.amount) : -money(item.amount)),
    0
  );
  return Math.max(money(fine.currentAmount) + adjustment, 0);
}

export function outstandingFineAmount(fine: FineBalance) {
  return Math.max(adjustedFineAmount(fine) - money(fine.settledAmount), 0);
}

export function allocateFinePayment(
  fines: FineBalance[],
  paidAmount: number,
  partialPaymentsEnabled: boolean
) {
  const amount = money(paidAmount);
  const outstandingAmount = fines.reduce((total, fine) => total + outstandingFineAmount(fine), 0);
  if (amount === 0) throw new Error('Paid amount must be greater than zero.');
  if (!partialPaymentsEnabled && amount < outstandingAmount) {
    throw new Error('Partial payments are not enabled.');
  }

  let available = amount;
  const allocations: PaymentAllocation[] = [];
  for (const fine of fines) {
    const outstanding = outstandingFineAmount(fine);
    const allocated = Math.min(outstanding, available);
    if (allocated > 0) {
      allocations.push({
        fineId: fine.id,
        amount: allocated,
        remainingBalance: outstanding - allocated,
      });
      available -= allocated;
    }
  }

  return {
    outstandingAmount,
    settledAmount: amount - available,
    unallocatedAmount: available,
    allocations,
  };
}
