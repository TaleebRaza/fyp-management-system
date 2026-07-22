'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CircleDollarSign,
  Clock3,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  Badge,
  Button,
  DashboardPanel,
  SectionHeader,
  StyledInput,
  TextArea,
} from '../ui/SharedUI';

const formatMoney = (value: unknown) => `PKR ${Math.max(Number(value) || 0, 0).toLocaleString()}`;

export default function FineManagementPanel({ showDialog }: any) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [payment, setPayment] = useState({
    methodLabel: '',
    accountTitle: '',
    accountNumber: '',
    instructions: '',
  });

  const applyPayload = (payload: any) => {
    setData(payload);
    setPayment({
      methodLabel: payload?.finePayment?.methodLabel || '',
      accountTitle: payload?.finePayment?.accountTitle || '',
      accountNumber: payload?.finePayment?.accountNumber || '',
      instructions: payload?.finePayment?.instructions || '',
    });
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/fines', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load fine management.');
      applyPayload(json);
    } catch (error: any) {
      showDialog({
        title: 'Fine management unavailable',
        message: error.message || 'Unable to load fine management.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // Fine data should load only when this tab is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusyAction(action + String(extra.studentId || ''));
    try {
      const response = await fetch('/api/admin/fines', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to update fine management.');
      applyPayload(json);
      showDialog({ title: 'Fine management updated', message: json.message });
    } catch (error: any) {
      showDialog({
        title: 'Update failed',
        message: error.message || 'Unable to update fine management.',
      });
    } finally {
      setBusyAction('');
    }
  };

  const savePayment = (event: FormEvent) => {
    event.preventDefault();
    void runAction('updatePaymentDetails', { finePayment: payment });
  };

  const confirmClear = (student: any) => {
    showDialog({
      type: 'confirm',
      title: `Verify payment for ${student.name}?`,
      message:
        'This marks every outstanding monetary fine on this student as resolved and immediately restores project upload access.',
      onConfirm: async () => {
        await runAction('clearRestriction', { studentId: student.id });
      },
    });
  };

  if (isLoading) {
    return (
      <DashboardPanel>
        <div className="flex min-h-52 items-center justify-center gap-3 text-[var(--color-text-muted)]">
          <Loader2 className="animate-spin" size={20} />
          Loading fine management...
        </div>
      </DashboardPanel>
    );
  }

  const students = data?.students || [];
  const accrual = data?.lateFineAccrual || {};
  const currentLateFine = data?.currentLateFine || { daysLate: 0, fineAmount: 0 };

  return (
    <div className="space-y-6">
      <DashboardPanel>
        <SectionHeader
          title="Late Fine Compounding"
          description="Pause without counting the paused calendar days, then resume from the frozen amount."
          action={
            <Button variant="outline" onClick={() => void fetchData()} disabled={Boolean(busyAction)}>
              <RefreshCcw size={16} />
              Refresh
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Status</p>
            <div className="mt-2">
              <Badge variant={accrual.paused ? 'danger' : 'success'}>
                {accrual.paused ? 'Paused' : 'Running'}
              </Badge>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Current days</p>
            <p className="mt-2 text-2xl font-black text-[var(--color-text)]">{currentLateFine.daysLate}</p>
          </div>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Current fine</p>
            <p className="mt-2 text-2xl font-black text-[var(--color-text)]">
              {formatMoney(currentLateFine.fineAmount)}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {accrual.paused ? (
            <Button
              onClick={() => void runAction('resumeAccrual')}
              disabled={Boolean(busyAction)}
            >
              {busyAction === 'resumeAccrual' ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Play size={16} />
              )}
              Resume Compounding
            </Button>
          ) : (
            <Button
              variant="danger"
              onClick={() => void runAction('pauseAccrual')}
              disabled={Boolean(busyAction)}
            >
              {busyAction === 'pauseAccrual' ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Pause size={16} />
              )}
              Pause Compounding
            </Button>
          )}
          <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Clock3 size={16} />
            {accrual.paused
              ? 'New registrations keep the frozen fine until compounding is resumed.'
              : 'New registrations use the current calculated fine.'}
          </p>
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <form onSubmit={savePayment}>
          <SectionHeader
            title="Student Payment Instructions"
            description="These details are loaded only for students with an outstanding fine."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Payment method
              </span>
              <StyledInput
                value={payment.methodLabel}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setPayment((previous) => ({ ...previous, methodLabel: event.target.value }))
                }
                placeholder="Bank transfer, Easypaisa, JazzCash..."
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Account title
              </span>
              <StyledInput
                value={payment.accountTitle}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setPayment((previous) => ({ ...previous, accountTitle: event.target.value }))
                }
                placeholder="Account holder name"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Account number
              </span>
              <StyledInput
                value={payment.accountNumber}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setPayment((previous) => ({ ...previous, accountNumber: event.target.value }))
                }
                placeholder="IBAN, account or wallet number"
              />
            </label>
          </div>
          <label className="mt-4 block">
            <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
              Payment and verification instructions
            </span>
            <TextArea
              value={payment.instructions}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                setPayment((previous) => ({ ...previous, instructions: event.target.value }))
              }
              placeholder="Explain where to send proof and how the student should request verification."
              rows={5}
            />
          </label>
          <Button className="mt-4" type="submit" disabled={Boolean(busyAction)}>
            {busyAction === 'updatePaymentDetails' ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <ShieldCheck size={16} />
            )}
            Save Payment Details
          </Button>
        </form>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader
          title="Restricted Students"
          description={`${students.length} student${students.length === 1 ? '' : 's'} currently blocked from new project uploads.`}
        />

        {students.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <CircleDollarSign className="mx-auto text-[var(--color-text-muted)]" size={34} />
            <p className="mt-3 font-bold text-[var(--color-text)]">No outstanding monetary fines</p>
          </div>
        ) : (
          <div className="space-y-3">
            {students.map((student: any) => (
              <div
                key={student.id}
                className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5 lg:grid-cols-[1fr_auto] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-[var(--color-text)]">{student.name}</p>
                    <Badge variant="warning">{student.projectStatus}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {student.rollNo} · {student.program} · {student.batch}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    {student.restriction.lateRegistrationFine && (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                        Late: {formatMoney(student.restriction.lateRegistrationFine.amount)}
                      </span>
                    )}
                    {student.restriction.adminFine && (
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-900 dark:bg-orange-950 dark:text-orange-100">
                        Admin: {formatMoney(student.restriction.adminFine.amount)}
                      </span>
                    )}
                    <span className="rounded-full bg-red-100 px-3 py-1 text-red-900 dark:bg-red-950 dark:text-red-100">
                      Total: {formatMoney(student.restriction.totalAmount)}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => confirmClear(student)}
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === `clearRestriction${student.id}` ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  Verify & Remove Restriction
                </Button>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
