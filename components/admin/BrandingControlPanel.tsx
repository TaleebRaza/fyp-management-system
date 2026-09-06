'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { AlertTriangle, CheckCircle2, Loader2, Palette, Save, Upload } from 'lucide-react';

import { applyPortalBranding } from '../branding/usePortalBranding';
import { isRecord } from '../../lib/security/input';
import { DEFAULT_BRANDING, type BrandingDto } from '../../types/branding';

type BrandingDraft = Pick<BrandingDto, 'universityName' | 'primaryColor' | 'accentColor'>;

function isBrandingDto(value: unknown): value is BrandingDto {
  return isRecord(value)
    && typeof value.universityName === 'string'
    && typeof value.primaryColor === 'string'
    && typeof value.accentColor === 'string'
    && (value.primaryTextColor === '#000000' || value.primaryTextColor === '#ffffff')
    && (value.accentTextColor === '#000000' || value.accentTextColor === '#ffffff')
    && typeof value.logoUrl === 'string';
}

function getResponseError(value: unknown) {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : 'Unable to save portal branding.';
}

export default function BrandingControlPanel() {
  const [branding, setBranding] = useState<BrandingDto>(DEFAULT_BRANDING);
  const [draft, setDraft] = useState<BrandingDraft>(DEFAULT_BRANDING);
  const [logo, setLogo] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const response = await fetch('/api/branding', { cache: 'no-store' });
        const result: unknown = await response.json();
        if (!response.ok || !isBrandingDto(result)) {
          throw new Error(getResponseError(result));
        }
        setBranding(result);
        setDraft(result);
      } catch (error) {
        setFeedback({
          type: 'error',
          message: error instanceof Error ? error.message : 'Unable to load portal branding.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    void loadBranding();
  }, []);

  const updateDraft = <Key extends keyof BrandingDraft>(key: Key, value: BrandingDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveBranding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.set('universityName', draft.universityName);
      formData.set('primaryColor', draft.primaryColor);
      formData.set('accentColor', draft.accentColor);
      if (logo) formData.set('logo', logo);

      const response = await fetch('/api/admin/branding', { method: 'PUT', body: formData });
      const result: unknown = await response.json();
      if (!response.ok || !isBrandingDto(result)) {
        throw new Error(getResponseError(result));
      }

      setBranding(result);
      setDraft(result);
      setLogo(null);
      applyPortalBranding(result);
      setFeedback({ type: 'success', message: 'Branding saved and applied to this portal session.' });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save portal branding.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="portal-card overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
            <Palette size={21} />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-[var(--color-text)]">University branding</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-text-muted)]">
              Update the university name, portal colors, and logo. The logo must be a PNG no larger than 2 MiB or 2048 pixels in either dimension.
            </p>
          </div>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
          <Image src={branding.logoUrl} alt={`${branding.universityName} logo`} width={56} height={56} className="h-full w-full object-contain p-1" />
        </div>
      </div>

      <form onSubmit={saveBranding} className="space-y-6 px-5 py-5 sm:px-6">
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]" htmlFor="branding-university-name">
            University name
          </label>
          <input
            id="branding-university-name"
            value={draft.universityName}
            onChange={(event) => updateDraft('universityName', event.target.value)}
            required
            minLength={1}
            maxLength={120}
            disabled={isLoading || isSaving}
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-soft)] focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:opacity-60"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {([
            ['primaryColor', 'Primary color'],
            ['accentColor', 'Accent color'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]" htmlFor={`branding-${key}`}>
                {label}
              </label>
              <div className="flex gap-3">
                <input
                  aria-label={`${label} picker`}
                  type="color"
                  value={draft[key]}
                  onChange={(event) => updateDraft(key, event.target.value)}
                  disabled={isLoading || isSaving}
                  className="h-11 w-12 cursor-pointer rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 disabled:cursor-not-allowed"
                />
                <input
                  id={`branding-${key}`}
                  value={draft[key]}
                  onChange={(event) => updateDraft(key, event.target.value)}
                  required
                  pattern="#[0-9A-Fa-f]{6}"
                  maxLength={7}
                  disabled={isLoading || isSaving}
                  className="h-11 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-mono text-sm font-medium text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:bg-[var(--color-surface-muted)] disabled:opacity-60"
                />
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]" htmlFor="branding-logo">
            University logo (optional)
          </label>
          <label htmlFor="branding-logo" className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm font-semibold text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-text)]">
            <Upload size={18} className="text-[var(--color-accent)]" />
            <span className="truncate">{logo ? logo.name : 'Keep the current logo'}</span>
          </label>
          <input
            id="branding-logo"
            type="file"
            accept="image/png"
            disabled={isLoading || isSaving}
            onChange={(event) => setLogo(event.target.files?.[0] ?? null)}
            className="sr-only"
          />
        </div>

        {feedback && (
          <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-[var(--color-success)]/30 bg-[var(--color-success-soft)] text-[var(--color-success)]'
              : 'border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
          }`}>
            {feedback.type === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0" size={17} /> : <AlertTriangle className="mt-0.5 shrink-0" size={17} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-[var(--color-text-soft)]">
            Existing installations keep the navy and amber defaults until you save a change.
          </p>
          <button
            type="submit"
            disabled={isLoading || isSaving}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-5 py-2 text-sm font-bold text-[var(--color-on-primary)] transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            {isSaving ? 'Saving branding...' : 'Save branding'}
          </button>
        </div>
      </form>
    </section>
  );
}
