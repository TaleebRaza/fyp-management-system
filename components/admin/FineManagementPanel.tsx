'use client';

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  CircleDollarSign,
  Clock3,
  Loader2,
  Pause,
  Play,
  RefreshCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  DashboardPanel,
  SectionHeader,
  StyledInput,
  TextArea,
} from '../ui';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import type { FineRestrictionSummary } from '../../lib/fineRestriction';
import {
  DEFAULT_FINE_RESTRICTIONS,
  FINE_RESTRICTION_DEFINITIONS,
  type FineRestrictionPolicy,
} from '../../types/registrationPolicy';

type RestrictedStudent = {
  id: string;
  name: string;
  rollNo: string;
  program: string;
  batch: string;
  projectStatus: string;
  restriction: FineRestrictionSummary;
};

type FineManagementData = {
  students?: RestrictedStudent[];
  search?: string;
  limit?: number;
  finePayment?: typeof EMPTY_PAYMENT;
  lateFineAccrual?: { paused?: boolean };
  fineRestrictions?: FineRestrictionPolicy;
  currentLateFine?: { daysLate: number; fineAmount: number };
};

const EMPTY_PAYMENT = {
  methodLabel: '',
  accountTitle: '',
  accountNumber: '',
  instructions: '',
};

const formatMoney = (value: unknown) => `PKR ${Math.max(Number(value) || 0, 0).toLocaleString()}`;

async function loadFineData(searchTerm = ''): Promise<FineManagementData> {
  const query = searchTerm ? `?q=${encodeURIComponent(searchTerm)}` : '';
  const response = await fetch(`/api/admin/fines${query}`, { cache: 'no-store' });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Unable to load fine management.');
  return json;
}

export default function FineManagementPanel({ showDialog }: { showDialog: ShowDialog }) {
  const [data, setData] = useState<FineManagementData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [payment, setPayment] = useState(EMPTY_PAYMENT);

  const applyPayload = useCallback((payload: FineManagementData) => {
    setData((previous) => ({ ...(previous || {}), ...payload }));
    setActiveSearch(payload?.search || '');

    if (payload?.finePayment) {
      setPayment({
        methodLabel: payload.finePayment.methodLabel || '',
        accountTitle: payload.finePayment.accountTitle || '',
        accountNumber: payload.finePayment.accountNumber || '',
        instructions: payload.finePayment.instructions || '',
      });
    }
  }, []);

  const fetchData = async (searchTerm = '') => {
    if (data) setIsListLoading(true);
    else setIsLoading(true);

    try {
      applyPayload(await loadFineData(searchTerm));
    } catch (error) {
      showDialog({
        title: 'Fine management unavailable',
        message: error instanceof Error ? error.message : 'Unable to load fine management.',
      });
    } finally {
      setIsLoading(false);
      setIsListLoading(false);
    }
  };

  useEffect(() => {
    void loadFineData()
      .then(applyPayload)
      .catch((error: unknown) => {
        showDialog({
          title: 'Fine management unavailable',
          message: error instanceof Error ? error.message : 'Unable to load fine management.',
        });
      })
      .finally(() => setIsLoading(false));
  }, [applyPayload, showDialog]);

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

      if (json.finePayment) {
        setPayment({
          methodLabel: json.finePayment.methodLabel || '',
          accountTitle: json.finePayment.accountTitle || '',
          accountNumber: json.finePayment.accountNumber || '',
          instructions: json.finePayment.instructions || '',
        });
        setData((previous) => ({ ...(previous || {}), finePayment: json.finePayment }));
      }

      if (json.lateFineAccrual || json.currentLateFine) {
        setData((previous) => ({
          ...(previous || {}),
          ...(json.lateFineAccrual ? { lateFineAccrual: json.lateFineAccrual } : {}),
          ...(json.currentLateFine ? { currentLateFine: json.currentLateFine } : {}),
        }));
      }

      if (json.fineRestrictions) {
        setData((previous) => ({
          ...(previous || {}),
          fineRestrictions: json.fineRestrictions,
        }));
      }

      if (json.studentId) {
        setData((previous) => ({
          ...(previous || {}),
          students: (previous?.students || []).filter(
            (student) => student.id !== json.studentId
          ),
        }));
      }

      showDialog({ title: 'Fine management updated', message: json.message });
    } catch (error) {
      showDialog({
        title: 'Update failed',
        message: error instanceof Error ? error.message : 'Unable to update fine management.',
      });
    } finally {
      setBusyAction('');
    }
  };

  const savePayment = (event: FormEvent) => {
    event.preventDefault();
    void runAction('updatePaymentDetails', { finePayment: payment });
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const searchTerm = searchInput.trim();

    if (!searchTerm) {
      setSearchInput('');
      void fetchData('');
      return;
    }

    if (searchTerm.length < 2) {
      showDialog({
        title: 'Search is too short',
        message: 'Enter at least two characters from the student name or the complete roll number.',
      });
      return;
    }

    setSearchInput(searchTerm);
    void fetchData(searchTerm);
  };

  const clearSearch = () => {
    setSearchInput('');
    void fetchData('');
  };

  const confirmClear = (student: RestrictedStudent) => {
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
  const listDescription = activeSearch
    ? `${students.length} matching restricted student${students.length === 1 ? '' : 's'} for “${activeSearch}”.`
    : `Showing up to ${data?.limit || 20} most recently registered students with outstanding fines.`;

  return (
    <div className="space-y-6">
      <DashboardPanel>
        <SectionHeader
          title="Late Fine Compounding"
          description="Pause without counting the paused calendar days, then resume from the frozen amount."
          action={
            <Button
              variant="outline"
              onClick={() => void fetchData(activeSearch)}
              disabled={Boolean(busyAction) || isListLoading}
            >
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
        <SectionHeader
          title="Fine Restrictions"
          description="Choose what an outstanding fine blocks. Allowing an action does not resolve the fine."
        />
        <div className="space-y-3">
          {FINE_RESTRICTION_DEFINITIONS.map((restriction) => {
            const enabled =
              data?.fineRestrictions?.[restriction.key] ??
              DEFAULT_FINE_RESTRICTIONS[restriction.key];

            return (
              <div
                key={restriction.key}
                className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-bold text-[var(--color-text)]">{restriction.name}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {enabled
                      ? 'Blocked for every team with an outstanding fine.'
                      : 'Allowed while each outstanding fine remains due.'}
                  </p>
                </div>
                <Button
                  variant={enabled ? 'outline' : 'danger'}
                  onClick={() =>
                    void runAction('setFineRestriction', {
                      restrictionKey: restriction.key,
                      enabled: !enabled,
                    })
                  }
                  disabled={Boolean(busyAction)}
                >
                  {busyAction === 'setFineRestriction' && (
                    <Loader2 className="animate-spin" size={16} />
                  )}
                  {enabled ? 'Allow uploads' : 'Restrict uploads'}
                </Button>
              </div>
            );
          })}
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
        <SectionHeader title="Restricted Students" description={listDescription} />

        <form
          onSubmit={submitSearch}
          className="mb-5 flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:flex-row"
        >
          <div className="min-w-0 flex-1">
            <StyledInput
              value={searchInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchInput(event.target.value)}
              placeholder="Search by student name or exact roll number"
              aria-label="Search fined students"
            />
          </div>
          <Button type="submit" disabled={isListLoading || Boolean(busyAction)}>
            {isListLoading ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            Search
          </Button>
          {activeSearch && (
            <Button
              type="button"
              variant="outline"
              onClick={clearSearch}
              disabled={isListLoading || Boolean(busyAction)}
            >
              <X size={16} />
              Clear
            </Button>
          )}
        </form>

        {isListLoading ? (
          <div className="flex min-h-44 items-center justify-center gap-3 text-[var(--color-text-muted)]">
            <Loader2 className="animate-spin" size={20} />
            Searching restricted students...
          </div>
        ) : students.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <CircleDollarSign className="mx-auto text-[var(--color-text-muted)]" size={34} />
            <p className="mt-3 font-bold text-[var(--color-text)]">
              {activeSearch ? 'No matching fined student' : 'No outstanding monetary fines'}
            </p>
            {activeSearch && (
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Try the complete roll number or another part of the student name.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {students.map((student) => (
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
