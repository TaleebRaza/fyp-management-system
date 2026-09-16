'use client';

import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useId, type ReactNode } from 'react';

type VivaWorkspaceShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  onExit: () => void;
  children: ReactNode;
};

export function VivaShortcut({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed right-4 top-20 z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-accent)]/45 bg-[var(--color-accent-soft)] px-4 py-2 text-sm font-bold text-[var(--color-text)] shadow-[var(--shadow-card)] transition-transform hover:-translate-y-0.5 hover:bg-[var(--color-accent)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:right-6"
      aria-label="Open Viva workspace"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-primary)]">
        <ClipboardList size={14} aria-hidden="true" />
      </span>
      Viva
    </button>
  );
}

export function VivaWorkspaceShell({
  eyebrow,
  title,
  description,
  onExit,
  children,
}: VivaWorkspaceShellProps) {
  const headingId = useId();

  return (
    <section className="mx-auto w-[calc(100%-1rem)] max-w-[120rem] sm:w-[calc(100%-3rem)]" aria-labelledby={headingId}>
      <header className="rounded-t-2xl bg-[var(--color-primary)] px-5 py-6 text-white sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-accent)]">
              {eyebrow}
            </p>
            <h2 id={headingId} className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to dashboard
          </button>
        </div>
      </header>
      <div className="rounded-b-2xl border border-t-0 border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-card)] sm:p-6 lg:p-7">
        {children}
      </div>
    </section>
  );
}
