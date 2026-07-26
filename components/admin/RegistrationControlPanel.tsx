'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Gavel,
  Loader2,
  LockKeyhole,
  Save,
  UnlockKeyhole,
} from 'lucide-react';
import {
  DEFAULT_REGISTRATION_POLICY,
  type RegistrationPolicyDto,
  type RegistrationPunishmentCategory,
} from '../../types/registrationPolicy';
import {
  clearBrowserDraft,
  readBrowserDraft,
  writeBrowserDraft,
} from '../../lib/browserDraftStorage';


type RegistrationPolicyDraft = Pick<RegistrationPolicyDto, 'isOpen' | 'closedMessage'> & {
  punishment: RegistrationPolicyDto['punishment'];
};

const REGISTRATION_POLICY_DRAFT_KEY = 'fyp-portal:admin-registration-policy-draft:v1';
const subscribeToClient = () => () => {};

const toEditablePolicy = (policy: RegistrationPolicyDto): RegistrationPolicyDraft => ({
  isOpen: policy.isOpen,
  closedMessage: policy.closedMessage,
  punishment: { ...policy.punishment },
});

const mergePolicyDraft = (
  policy: RegistrationPolicyDto,
  draft: RegistrationPolicyDraft
): RegistrationPolicyDto => ({
  ...policy,
  isOpen: draft.isOpen,
  closedMessage: draft.closedMessage,
  punishment: {
    ...policy.punishment,
    ...draft.punishment,
  },
});

type Props = {
  initialPolicy?: RegistrationPolicyDto;
  onPolicyChange?: (policy: RegistrationPolicyDto) => void;
};

export default function RegistrationControlPanel({
  initialPolicy = DEFAULT_REGISTRATION_POLICY,
  onPolicyChange,
}: Props) {
  const [policy, setPolicy] = useState<RegistrationPolicyDto>(initialPolicy);
  const [savedPolicy, setSavedPolicy] = useState<RegistrationPolicyDraft>(() =>
    toEditablePolicy(initialPolicy)
  );
  const [isDraftReady, setIsDraftReady] = useState(false);
  const [loadedPolicySignature, setLoadedPolicySignature] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const initialPolicySignature = useMemo(
    () => JSON.stringify(toEditablePolicy(initialPolicy)),
    [initialPolicy]
  );
  const isMounted = useSyncExternalStore(subscribeToClient, () => true, () => false);

  if (isMounted && (!isDraftReady || loadedPolicySignature !== initialPolicySignature)) {
    const baseline = toEditablePolicy(initialPolicy);
    const draft = readBrowserDraft<RegistrationPolicyDraft>(REGISTRATION_POLICY_DRAFT_KEY);

    setSavedPolicy(baseline);
    setPolicy(draft ? mergePolicyDraft(initialPolicy, draft) : initialPolicy);
    setIsDraftReady(true);
    setLoadedPolicySignature(initialPolicySignature);
  }

  useEffect(() => {
    if (!isDraftReady) return;

    const editablePolicy = toEditablePolicy(policy);
    const saveTimer = window.setTimeout(() => {
      if (JSON.stringify(editablePolicy) === JSON.stringify(savedPolicy)) {
        clearBrowserDraft(REGISTRATION_POLICY_DRAFT_KEY);
        return;
      }

      writeBrowserDraft(REGISTRATION_POLICY_DRAFT_KEY, editablePolicy);
    }, 300);

    return () => window.clearTimeout(saveTimer);
  }, [isDraftReady, policy, savedPolicy]);

  const updatePunishment = <K extends keyof RegistrationPolicyDto['punishment'],>(
    key: K,
    value: RegistrationPolicyDto['punishment'][K]
  ) => {
    setPolicy((current) => ({
      ...current,
      punishment: { ...current.punishment, [key]: value },
    }));
  };

  const changeCategory = (category: RegistrationPunishmentCategory) => {
    setPolicy((current) => ({
      ...current,
      punishment: {
        ...current.punishment,
        category,
        title:
          current.punishment.title ||
          (category === 'fine' ? 'Late registration fine' : 'Registration punishment'),
        amount: category === 'fine' ? current.punishment.amount : 0,
      },
    }));
  };

  const savePolicy = async () => {
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch('/api/admin/registration-policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });
      const data = await response.json();

      if (!response.ok) {
        setFeedback({ type: 'error', message: data.error || 'Unable to save registration settings.' });
        return;
      }

      const nextPolicy = data.policy as RegistrationPolicyDto;
      clearBrowserDraft(REGISTRATION_POLICY_DRAFT_KEY);
      setSavedPolicy(toEditablePolicy(nextPolicy));
      setPolicy(nextPolicy);
      onPolicyChange?.(nextPolicy);
      setFeedback({ type: 'success', message: data.message || 'Registration policy updated.' });
    } catch {
      setFeedback({ type: 'error', message: 'Unable to connect to the server. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const statusTone = policy.isOpen
    ? 'border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-[var(--color-success)]'
    : 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger)]';

  return (
    <section className="portal-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <LockKeyhole size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">
              Student registration control
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
              Lock or reopen the public registration form. An optional fine or other punishment is
              copied only to students who register while that policy is active.
            </p>
          </div>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${statusTone}`}>
          {policy.isOpen ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
          {policy.isOpen ? 'Registration open' : 'Registration closed'}
        </span>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setPolicy((current) => ({ ...current, isOpen: true }))}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
              policy.isOpen
                ? 'border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'
            }`}
          >
            <UnlockKeyhole size={18} />
            Open registration
          </button>
          <button
            type="button"
            onClick={() => setPolicy((current) => ({ ...current, isOpen: false }))}
            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
              !policy.isOpen
                ? 'border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]'
            }`}
          >
            <LockKeyhole size={18} />
            Close registration
          </button>
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Message shown while registration is closed
          </label>
          <textarea
            value={policy.closedMessage}
            onChange={(event) => setPolicy((current) => ({ ...current, closedMessage: event.target.value }))}
            maxLength={500}
            rows={3}
            className="min-h-24 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-accent)]"
            placeholder="Explain why registration is closed and what students should do next."
          />
          <p className="mt-1 text-right text-xs text-[var(--color-text-soft)]">
            {policy.closedMessage.length}/500
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <Gavel size={18} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text)]">
                  Punishment for future registrations
                </h3>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  Existing students are never changed. Disable this after the intended registration
                  window ends.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={policy.punishment.enabled}
              onClick={() => updatePunishment('enabled', !policy.punishment.enabled)}
              className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors ${
                policy.punishment.enabled
                  ? 'bg-[var(--color-primary)]'
                  : 'bg-[var(--color-border)]'
              }`}
            >
              <span
                className={`pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  policy.punishment.enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {policy.punishment.enabled && (
            <div className="mt-5 space-y-4 border-t border-[var(--color-border)] pt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => changeCategory('fine')}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${
                    policy.punishment.category === 'fine'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]'
                  }`}
                >
                  <Banknote size={18} />
                  Monetary fine
                </button>
                <button
                  type="button"
                  onClick={() => changeCategory('other')}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors ${
                    policy.punishment.category === 'other'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-text)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]'
                  }`}
                >
                  <Gavel size={18} />
                  Other punishment
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                    Punishment title
                  </label>
                  <input
                    value={policy.punishment.title}
                    onChange={(event) => updatePunishment('title', event.target.value)}
                    maxLength={120}
                    className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                    placeholder="e.g. Reopening registration fine"
                  />
                </div>

                {policy.punishment.category === 'fine' && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                      Fine amount (PKR)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={1000000}
                      step={1}
                      value={policy.punishment.amount || ''}
                      onChange={(event) => updatePunishment('amount', Number(event.target.value || 0))}
                      className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                      placeholder="e.g. 1000"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                  Student-facing details
                </label>
                <textarea
                  value={policy.punishment.description}
                  onChange={(event) => updatePunishment('description', event.target.value)}
                  maxLength={1000}
                  rows={4}
                  className="min-h-28 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  placeholder="State exactly what applies, why, and how the student can resolve it."
                />
              </div>
            </div>
          )}
        </div>

        {feedback && (
          <div
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              feedback.type === 'success'
                ? 'border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-[var(--color-success)]'
                : 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
            ) : (
              <AlertTriangle className="mt-0.5 shrink-0" size={17} />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--color-text-soft)]">
            Unsaved changes are stored only in this browser and are removed after a successful save.
          </p>
          <button
            type="button"
            disabled={isSaving}
            onClick={savePolicy}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {isSaving ? 'Saving policy...' : 'Save registration policy'}
          </button>
        </div>
      </div>
    </section>
  );
}
