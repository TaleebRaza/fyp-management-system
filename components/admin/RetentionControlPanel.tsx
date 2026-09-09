'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Save, ShieldCheck } from 'lucide-react';

import { Button } from '../ui';
import { isRecord } from '../../lib/security/input';
import {
  DEFAULT_RETENTION_SETTINGS,
  parseRetentionSettings,
  type RetentionConfiguration,
  type RetentionExecutionReport,
  type RetentionPreview,
  type RetentionSettings,
} from '../../types/retention';

type RetentionResponse = {
  configuration: RetentionConfiguration;
  preview: RetentionPreview;
};

type RetentionCategoryKey = Exclude<keyof RetentionSettings, 'schedule'>;

const categoryLabels: Record<RetentionCategoryKey, { title: string; description: string }> = {
  playedVoiceNotes: {
    title: 'Played project voice notes',
    description: 'Delete only notes that project members have played.',
  },
  unplayedVoiceNotes: {
    title: 'Unplayed project voice notes',
    description: 'Leave disabled unless an explicit age limit is required.',
  },
  audioBroadcasts: {
    title: 'Supervisor audio broadcasts',
    description: 'Leave disabled unless broadcasts have an agreed retention period.',
  },
  unusedPdfUploads: {
    title: 'Unused PDF uploads',
    description: 'Only orphaned finalized uploads are queued. Attached project PDFs are preserved.',
  },
};

const retentionCategoryKeys: RetentionCategoryKey[] = [
  'playedVoiceNotes',
  'unplayedVoiceNotes',
  'audioBroadcasts',
  'unusedPdfUploads',
];

const reportCountFields = [
  'playedVoiceNotesDeleted',
  'unplayedVoiceNotesDeleted',
  'audioBroadcastsCleared',
  'unusedPdfUploadsQueued',
  'queuedObjects',
  'queuedDeletionBytes',
  'protectedSharedObjects',
  'skippedInvalidObjects',
] as const;

function isReport(value: unknown): value is RetentionExecutionReport {
  return isRecord(value)
    && (value.status === 'completed' || value.status === 'failed' || value.status === 'disabled'
      || value.status === 'not-configured' || value.status === 'not-due' || value.status === 'running')
    && (value.scheduledFor === null || typeof value.scheduledFor === 'string')
    && (value.completedAt === null || typeof value.completedAt === 'string')
    && reportCountFields.every((field) => Number.isSafeInteger(value[field]) && Number(value[field]) >= 0);
}

function isResponse(value: unknown): value is RetentionResponse {
  if (!isRecord(value)) return false;
  const configuration = value.configuration;
  const preview = value.preview;
  if (!isRecord(configuration) || !isRecord(preview)) return false;
  try {
    parseRetentionSettings(configuration.settings);
  } catch {
    return false;
  }
  return typeof configuration.configured === 'boolean'
    && typeof configuration.invalid === 'boolean'
    && (configuration.lastReport === null || isReport(configuration.lastReport))
    && typeof preview.limitedToBatch === 'boolean'
    && reportCountFields.every((field) => Number.isSafeInteger(preview[field]) && Number(preview[field]) >= 0);
}

function responseError(value: unknown) {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : 'Unable to save retention settings.';
}

function formatTimestamp(value: string | null) {
  if (!value) return 'No retention run has completed yet.';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'The saved run timestamp is invalid.' : date.toLocaleString();
}

export default function RetentionControlPanel() {
  const [settings, setSettings] = useState<RetentionSettings>(DEFAULT_RETENTION_SETTINGS);
  const [configuration, setConfiguration] = useState<RetentionConfiguration | null>(null);
  const [preview, setPreview] = useState<RetentionPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/admin/retention', { cache: 'no-store' });
          const result: unknown = await response.json();
          if (!response.ok || !isResponse(result)) throw new Error(responseError(result));
          setSettings(parseRetentionSettings(result.configuration.settings));
          setConfiguration(result.configuration);
          setPreview(result.preview);
        } catch (error) {
          setFeedback({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unable to load retention settings.',
          });
        } finally {
          setIsLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const updateSchedule = <Key extends keyof RetentionSettings['schedule']>(
    key: Key,
    value: RetentionSettings['schedule'][Key]
  ) => {
    setSettings((current) => ({ ...current, schedule: { ...current.schedule, [key]: value } }));
  };

  const updateCategory = <Key extends keyof RetentionSettings[RetentionCategoryKey]>(
    category: RetentionCategoryKey,
    key: Key,
    value: RetentionSettings[RetentionCategoryKey][Key]
  ) => {
    setSettings((current) => ({
      ...current,
      [category]: { ...current[category], [key]: value },
    }));
  };

  const saveRetention = async () => {
    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch('/api/admin/retention', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const result: unknown = await response.json();
      if (!response.ok || !isResponse(result)) throw new Error(responseError(result));
      setSettings(parseRetentionSettings(result.configuration.settings));
      setConfiguration(result.configuration);
      setPreview(result.preview);
      setFeedback({ type: 'success', message: 'Retention settings saved. The next due run uses this policy.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save retention settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const report = configuration?.lastReport;

  return (
    <section className="portal-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Clock3 size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">Retention and cleanup</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
              Essential email, reservation, and deletion work runs independently every minute. This policy only controls optional content retention.
            </p>
          </div>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${configuration?.configured && settings.schedule.enabled ? 'border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]'}`}>
          <ShieldCheck size={14} />
          {configuration?.configured && settings.schedule.enabled ? 'Retention active' : 'Retention inactive'}
        </span>
      </div>

      <div className="space-y-6 px-5 py-5 sm:px-6">
        {configuration?.invalid && (
          <div role="alert" className="flex gap-3 rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            The saved retention policy is invalid and has been disabled. Save the reviewed settings below to replace it.
          </div>
        )}

        <div className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:grid-cols-[1fr_auto] sm:items-end sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-[var(--color-text)]" htmlFor="retention-timezone">
              Timezone
              <input
                id="retention-timezone"
                value={settings.schedule.timezone}
                onChange={(event) => updateSchedule('timezone', event.target.value)}
                disabled={isLoading || isSaving}
                maxLength={100}
                required
                className="mt-2 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium outline-none focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Asia/Karachi"
              />
            </label>
            <label className="text-sm font-semibold text-[var(--color-text)]" htmlFor="retention-time">
              Daily time
              <input
                id="retention-time"
                type="time"
                value={settings.schedule.time}
                onChange={(event) => updateSchedule('time', event.target.value)}
                disabled={isLoading || isSaving || !settings.schedule.enabled}
                required
                className="mt-2 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm font-medium outline-none focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.schedule.enabled}
            aria-label="Enable scheduled retention"
            disabled={isLoading || isSaving}
            onClick={() => updateSchedule('enabled', !settings.schedule.enabled)}
            className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${settings.schedule.enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
          >
            <span className={`pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings.schedule.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {retentionCategoryKeys.map((category) => {
            const details = categoryLabels[category];
            const candidateCount = preview
              ? category === 'playedVoiceNotes' ? preview.playedVoiceNotesDeleted
                : category === 'unplayedVoiceNotes' ? preview.unplayedVoiceNotesDeleted
                  : category === 'audioBroadcasts' ? preview.audioBroadcastsCleared
                    : preview.unusedPdfUploadsQueued
              : 0;
            return (
              <div key={category} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-text)]">{details.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{details.description}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings[category].enabled}
                    aria-label={`Enable ${details.title} retention`}
                    disabled={isLoading || isSaving || !settings.schedule.enabled}
                    onClick={() => updateCategory(category, 'enabled', !settings[category].enabled)}
                    className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${settings[category].enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'}`}
                  >
                    <span className={`pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${settings[category].enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                <label className="mt-4 block text-sm font-semibold text-[var(--color-text)]" htmlFor={`retention-${category}-days`}>
                  Delete after days
                  <input
                    id={`retention-${category}-days`}
                    type="number"
                    min={1}
                    max={3650}
                    value={settings[category].ageDays}
                    onChange={(event) => updateCategory(category, 'ageDays', Number(event.target.value))}
                    disabled={isLoading || isSaving || !settings.schedule.enabled || !settings[category].enabled}
                    className="mt-2 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 text-sm font-medium outline-none focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
                <p className="mt-3 text-xs font-medium text-[var(--color-text-soft)]">
                  Preview: {candidateCount} eligible in the next bounded batch.
                </p>
              </div>
            );
          })}
        </div>

        {preview && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">
            Preview queues up to {preview.queuedObjects} object{preview.queuedObjects === 1 ? '' : 's'} ({preview.queuedDeletionBytes.toLocaleString()} bytes). {preview.protectedSharedObjects} shared reference{preview.protectedSharedObjects === 1 ? '' : 's'} remain protected, and {preview.skippedInvalidObjects} invalid key{preview.skippedInvalidObjects === 1 ? '' : 's'} require an audit.
          </div>
        )}

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text-muted)]">
          <div className="flex items-center gap-2 font-semibold text-[var(--color-text)]"><Clock3 size={16} /> Last execution</div>
          <p className="mt-2">{formatTimestamp(report?.completedAt || null)}</p>
          {report && <p className="mt-1">Status: {report.status}. Deleted or cleared {report.playedVoiceNotesDeleted + report.unplayedVoiceNotesDeleted + report.audioBroadcastsCleared} records and queued {report.queuedObjects} object deletions.</p>}
        </div>

        {feedback && (
          <div role="status" className={`flex gap-3 rounded-xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger)]'}`}>
            {feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <AlertTriangle className="mt-0.5 shrink-0" size={18} />}
            {feedback.message}
          </div>
        )}

        <Button variant="primary" disabled={isLoading || isSaving} onClick={() => void saveRetention()}>
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isSaving ? 'Saving retention...' : 'Save retention settings'}
        </Button>
      </div>
    </section>
  );
}
