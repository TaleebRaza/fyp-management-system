'use client';

import { AlertTriangle } from 'lucide-react';

type LateRegistrationFineBannerProps = {
  daysLate?: number;
  amount?: number;
};

const amountFormatter = new Intl.NumberFormat('en-PK', {
  maximumFractionDigits: 0,
});

export function LateRegistrationFineBanner({
  daysLate = 0,
  amount = 0,
}: LateRegistrationFineBannerProps) {
  const safeDaysLate = Math.max(Math.trunc(Number(daysLate) || 0), 0);
  const safeAmount = Math.max(Math.trunc(Number(amount) || 0), 0);

  if (safeDaysLate <= 0 || safeAmount <= 0) {
    return null;
  }

  const formattedAmount = amountFormatter.format(safeAmount);

  return (
    <section
      role="alert"
      aria-live="polite"
      aria-label={`Late registration fine: PKR ${formattedAmount}`}
      className="rounded-xl border border-red-300 bg-red-50 p-4 shadow-sm dark:border-red-700/70 dark:bg-red-950/50"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
            <AlertTriangle size={21} aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-extrabold text-red-950 dark:text-red-50">
              Late Registration Fine
            </p>
            <p className="mt-1 text-sm leading-6 text-red-900 dark:text-red-100">
              You registered {safeDaysLate} day{safeDaysLate === 1 ? '' : 's'} after the deadline and have been fined Rs. {formattedAmount}.
            </p>
          </div>
        </div>

        <div className="shrink-0 rounded-xl border border-red-300 bg-white px-4 py-3 text-left sm:text-right dark:border-red-700 dark:bg-red-950/70">
          <p className="text-xs font-extrabold uppercase tracking-wide text-red-700 dark:text-red-300">
            Amount Due
          </p>
          <p className="mt-1 text-2xl font-black text-red-700 dark:text-red-300">
            PKR {formattedAmount}
          </p>
        </div>
      </div>
    </section>
  );
}