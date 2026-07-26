'use client';

import { AlertTriangle, CircleDollarSign, RefreshCcw } from 'lucide-react';
import { Button, DashboardPanel, SectionHeader } from '../ui/SharedUI';
import type { FineRestriction } from './studentDashboardTypes';

const formatMoney = (value: unknown) => `PKR ${Math.max(Number(value) || 0, 0).toLocaleString()}`;

type Props = {
  restriction: FineRestriction;
  onRefresh: () => Promise<void> | void;
};

const DetailRow = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
    <p className="mt-2 break-words text-sm font-bold text-[var(--color-text)]">{value || 'Not provided'}</p>
  </div>
);

export default function FinePaymentPanel({ restriction, onRefresh }: Props) {
  if (!restriction?.active) return null;

  const payment = restriction.payment || {};
  const hasPaymentDetails = Boolean(
    payment.methodLabel || payment.accountTitle || payment.accountNumber || payment.instructions
  );

  return (
    <div className="space-y-6">
      <DashboardPanel>
        <SectionHeader
          title="Fine Payment"
          description="Project uploads are locked until the administrator verifies your payment."
          action={
            <Button variant="outline" onClick={() => void onRefresh()}>
              <RefreshCcw size={16} />
              Refresh Status
            </Button>
          }
        />

        <div className="rounded-2xl border border-red-300 bg-red-100/70 p-5 text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={22} />
            <div>
              <p className="font-black">Submission restriction active</p>
              <p className="mt-1 text-sm leading-6">
                Your existing PDF remains available for supervisor review, but you cannot upload or
                resubmit another project document until the fine is cleared.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {restriction.lateRegistrationFine && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm font-black text-amber-950 dark:text-amber-100">
                Late registration fine
              </p>
              <p className="mt-2 text-2xl font-black text-amber-950 dark:text-amber-50">
                {formatMoney(restriction.lateRegistrationFine.amount)}
              </p>
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                {restriction.lateRegistrationFine.daysLate} charged day(s)
              </p>
            </div>
          )}

          {restriction.adminFine && (
            <div className="rounded-2xl border border-orange-300 bg-orange-50 p-5 dark:border-orange-800 dark:bg-orange-950/30">
              <p className="text-sm font-black text-orange-950 dark:text-orange-100">
                {restriction.adminFine.title || 'Administrative fine'}
              </p>
              <p className="mt-2 text-2xl font-black text-orange-950 dark:text-orange-50">
                {formatMoney(restriction.adminFine.amount)}
              </p>
              {restriction.adminFine.description && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-orange-800 dark:text-orange-200">
                  {restriction.adminFine.description}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-[var(--color-primary)] p-5 text-white">
          <div className="flex items-center gap-3">
            <CircleDollarSign size={24} />
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-white/70">Total due</p>
              <p className="text-2xl font-black">{formatMoney(restriction.totalAmount)}</p>
            </div>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">Pending verification</span>
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader
          title="Payment Account"
          description="Pay using the details below, then contact the administration for verification."
        />

        {hasPaymentDetails ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailRow label="Payment method" value={payment.methodLabel} />
              <DetailRow label="Account title" value={payment.accountTitle} />
              <DetailRow label="Account number" value={payment.accountNumber} />
            </div>
            <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                Instructions
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[var(--color-text)]">
                {payment.instructions || 'Contact the FYP administration after making payment.'}
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 text-center">
            <p className="font-bold text-[var(--color-text)]">Payment details are being prepared.</p>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              Contact the FYP administration before sending payment.
            </p>
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
