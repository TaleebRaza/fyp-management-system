'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, FileCheck2, Loader2, RefreshCcw, Send, ShieldAlert } from 'lucide-react';
import {
  Badge,
  Button,
  DashboardPanel,
  SectionHeader,
  StyledInput,
  TextArea,
} from '../ui/SharedUI';

type FineView = {
  id: string;
  title: string;
  reason: string;
  originalAmount: number;
  currentAmount: number;
  accruedAmount: number;
  settledAmount: number;
  outstandingAmount: number;
  lateDays: number;
  policyVersion: number;
  status: string;
  disputesAllowed: boolean;
  deadline?: string | null;
};

type PaymentView = {
  _id: string;
  reference: string;
  paidAmount: number;
  paymentDate: string;
  proofKey?: string | null;
  status: string;
  rejectionReason?: string;
  createdAt: string;
};

type FinePayload = {
  fines: FineView[];
  payments?: PaymentView[];
  notifications?: Array<{ _id: string; action: string; details: string; createdAt: string }>;
  outstandingAmount: number;
  effectiveRestrictions: {
    sources?: Array<{ fineId: string; restriction: string; sourceLabel: string }>;
  };
  payment?: {
    methodLabel?: string;
    accountTitle?: string;
    accountNumber?: string;
    instructions?: string;
    requiredProof?: boolean;
    verificationContact?: string;
    partialPaymentsEnabled?: boolean;
  };
};

const money = (value: unknown) => `PKR ${Math.max(Number(value) || 0, 0).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

async function responseJson(response: Response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'The fine request failed.');
  return payload;
}

async function loadFinePayload(): Promise<FinePayload> {
  return responseJson(await fetch('/api/fines', { cache: 'no-store' }));
}

export default function DynamicFinePaymentPanel() {
  const [data, setData] = useState<FinePayload | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFineIds, setSelectedFineIds] = useState<string[]>([]);
  const [reference, setReference] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [message, setMessage] = useState('');
  const [proof, setProof] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await loadFinePayload();
      setData(payload);
      setSelectedFineIds((current) => current.filter((id) =>
        payload.fines.some((fine) => fine.id === id && !['paid', 'waived', 'cancelled'].includes(fine.status))
      ));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load fine status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadFinePayload()
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load fine status.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const unresolved = (data?.fines || []).filter(
    (fine) => !['paid', 'waived', 'cancelled'].includes(fine.status)
  );
  const payment = data?.payment || {};

  const toggleFine = (fineId: string) => {
    setSelectedFineIds((current) =>
      current.includes(fineId) ? current.filter((id) => id !== fineId) : [...current, fineId]
    );
  };

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (selectedFineIds.length === 0) {
      setError('Select at least one fine to pay.');
      return;
    }
    if (payment.requiredProof !== false && !proof) {
      setError('Attach a PDF, JPEG, or PNG payment proof.');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = crypto.randomUUID().replaceAll('-', '_');
      let proofKey = '';
      if (proof) {
        const reservation = await responseJson(await fetch('/api/fines/payment-proof', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileSize: proof.size,
            contentType: proof.type,
            idempotencyKey,
          }),
        }));
        const upload = await fetch(reservation.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': proof.type },
          body: proof,
        });
        if (!upload.ok) throw new Error('Payment proof upload failed.');
        proofKey = reservation.proofKey;
      }

      const result = await responseJson(await fetch('/api/fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submitPayment',
          fineIds: selectedFineIds,
          reference,
          paidAmount: Number(paidAmount),
          paymentDate,
          message,
          proofKey,
          idempotencyKey,
        }),
      }));
      setNotice(result.message || 'Payment submitted for verification.');
      setReference('');
      setPaidAmount('');
      setMessage('');
      setProof(null);
      setSelectedFineIds([]);
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const dispute = async (fine: FineView) => {
    const reason = window.prompt(`Why are you disputing “${fine.title}”?`);
    if (!reason?.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await responseJson(await fetch('/api/fines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disputeFine', fineId: fine.id, reason }),
      }));
      setNotice(result.message || 'Fine dispute submitted.');
      await load();
    } catch (disputeError) {
      setError(disputeError instanceof Error ? disputeError.message : 'Unable to dispute the fine.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <DashboardPanel>
        <div className="flex min-h-48 items-center justify-center gap-3 text-[var(--color-text-muted)]">
          <Loader2 className="animate-spin" size={20} />
          Loading fine status...
        </div>
      </DashboardPanel>
    );
  }

  return (
    <div className="space-y-6">
      {(error || notice) && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm font-semibold ${
            error
              ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'
          }`}
        >
          {error || notice}
        </div>
      )}

      <DashboardPanel>
        <SectionHeader
          title="Fine Status"
          description="Amounts, settlements, and restrictions are calculated by the server."
          action={
            <Button variant="outline" onClick={() => void load()} disabled={loading || submitting}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
              Refresh
            </Button>
          }
        />
        {unresolved.length === 0 ? (
          <p className="rounded-xl border border-[var(--color-border)] p-5 text-sm text-[var(--color-text-muted)]">
            No unresolved fines.
          </p>
        ) : (
          <div className="space-y-4">
            {unresolved.map((fine) => {
              const sources = (data?.effectiveRestrictions.sources || []).filter(
                (source) => source.fineId === fine.id
              );
              return (
                <article key={fine.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-[var(--color-text)]">{fine.title}</h3>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{fine.reason}</p>
                    </div>
                    <Badge variant="warning">{fine.status.replaceAll('-', ' ')}</Badge>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                    <div><dt className="text-[var(--color-text-muted)]">Outstanding</dt><dd className="font-black">{money(fine.outstandingAmount)}</dd></div>
                    <div><dt className="text-[var(--color-text-muted)]">Original</dt><dd className="font-bold">{money(fine.originalAmount)}</dd></div>
                    <div><dt className="text-[var(--color-text-muted)]">Accrued</dt><dd className="font-bold">{money(fine.accruedAmount)}</dd></div>
                    <div><dt className="text-[var(--color-text-muted)]">Settled</dt><dd className="font-bold">{money(fine.settledAmount)}</dd></div>
                    <div><dt className="text-[var(--color-text-muted)]">Late days</dt><dd className="font-bold">{fine.lateDays}</dd></div>
                  </dl>
                  {sources.length > 0 && (
                    <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                      <p className="flex items-center gap-2 font-black"><AlertTriangle size={16} /> Effective restrictions</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {sources.map((source) => (
                          <li key={`${source.restriction}:${source.sourceLabel}`}>
                            {source.restriction.replaceAll('-', ' ')} ({source.sourceLabel})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {fine.disputesAllowed && fine.status !== 'disputed' && (
                    <Button className="mt-4" variant="outline" onClick={() => void dispute(fine)} disabled={submitting}>
                      <ShieldAlert size={16} /> Dispute Fine
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div className="mt-5 rounded-2xl bg-[var(--color-primary)] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wide text-white/70">Total outstanding</p>
          <p className="mt-1 text-2xl font-black">{money(data?.outstandingAmount)}</p>
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Payment Instructions" description="Submit payment details here for administrator verification." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Method</p><p className="mt-2 font-bold">{payment.methodLabel || 'Not provided'}</p></div>
          <div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Account title</p><p className="mt-2 font-bold">{payment.accountTitle || 'Not provided'}</p></div>
          <div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Account number</p><p className="mt-2 break-words font-bold">{payment.accountNumber || 'Not provided'}</p></div>
          <div><p className="text-xs font-bold uppercase text-[var(--color-text-muted)]">Verification contact</p><p className="mt-2 break-words font-bold">{payment.verificationContact || 'Not provided'}</p></div>
        </div>
        <p className="mt-4 whitespace-pre-wrap rounded-xl border border-[var(--color-border)] p-4 text-sm leading-6">
          {payment.instructions || 'Payment instructions have not been configured yet.'}
        </p>

        {unresolved.length > 0 && (
          <form className="mt-6 space-y-4 border-t border-[var(--color-border)] pt-6" onSubmit={submitPayment}>
            <h3 className="font-black text-[var(--color-text)]">Submit payment proof</h3>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-[var(--color-text)]">Fines being paid</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {unresolved.map((fine) => (
                  <label key={fine.id} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] p-3 text-sm font-semibold">
                    <input type="checkbox" checked={selectedFineIds.includes(fine.id)} onChange={() => toggleFine(fine.id)} />
                    <span className="min-w-0 flex-1 truncate">{fine.title}</span>
                    <span>{money(fine.outstandingAmount)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Payment reference</span>
                <StyledInput value={reference} onChange={(event) => setReference(event.target.value)} required maxLength={160} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Paid amount (PKR)</span>
                <StyledInput type="number" min="1" step="1" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} required />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Payment date</span>
                <StyledInput type="date" max={today()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required />
              </label>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">
                Payment proof {payment.requiredProof === false ? '(optional)' : '(required)'}
              </span>
              <input
                className="block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) => setProof(event.target.files?.[0] || null)}
                required={payment.requiredProof !== false}
              />
              <span className="mt-1 block text-xs text-[var(--color-text-muted)]">PDF, JPEG, or PNG, up to 4MB.</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Message (optional)</span>
              <TextArea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} maxLength={1_000} />
            </label>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              Submit for Verification
            </Button>
          </form>
        )}
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Payment Verification" description="Submitted proofs remain pending until an administrator accepts or rejects them." />
        {(data?.payments || []).length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">No payment submissions yet.</p>
        ) : (
          <div className="space-y-3">
            {(data?.payments || []).map((item) => (
              <article key={item._id} className="rounded-xl border border-[var(--color-border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black">{item.reference} · {money(item.paidAmount)}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">Paid {new Date(item.paymentDate).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={item.status === 'accepted' ? 'success' : item.status === 'rejected' ? 'danger' : 'warning'}>
                    {item.status.replaceAll('-', ' ')}
                  </Badge>
                </div>
                {item.rejectionReason && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{item.rejectionReason}</p>}
                {item.proofKey && (
                  <a className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--color-primary)] underline" href={`/api/read-pdf?url=${encodeURIComponent(item.proofKey)}`} target="_blank" rel="noreferrer">
                    <FileCheck2 size={16} /> View submitted proof
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </DashboardPanel>

      {(data?.notifications || []).length > 0 && (
        <DashboardPanel>
          <SectionHeader title="Fine Notifications" description="Recent fine and payment activity recorded by the portal." />
          <ol className="space-y-3">
            {(data?.notifications || []).map((item) => (
              <li key={item._id} className="rounded-xl border border-[var(--color-border)] p-4 text-sm">
                <p className="font-black">{item.action.replaceAll('-', ' ')}</p>
                <p className="mt-1 text-[var(--color-text-muted)]">{item.details}</p>
              </li>
            ))}
          </ol>
        </DashboardPanel>
      )}
    </div>
  );
}
