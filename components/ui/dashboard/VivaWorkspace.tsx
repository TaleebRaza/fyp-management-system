'use client';

import Image from 'next/image';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useId, type ReactNode } from 'react';

type VivaWorkspaceShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  onExit: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  children: ReactNode;
};

export function VivaWorkspaceShell({
  eyebrow,
  title,
  description,
  onExit,
  isDarkMode,
  onToggleTheme,
  children,
}: VivaWorkspaceShellProps) {
  const headingId = useId();

  return (
    <section className="min-h-[100dvh] bg-[var(--color-bg)]" aria-labelledby={headingId}>
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]"><Image src="/logo.png" alt="University Logo" width={24} height={24} />{eyebrow}</div>
            <h2 id={headingId} className="mt-2 text-xl font-semibold tracking-tight text-[var(--color-text)] sm:text-2xl">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-2">
          {onToggleTheme && <button type="button" onClick={onToggleTheme} className="grid h-10 w-10 place-items-center rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)]" aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>{isDarkMode ? <Sun size={18} /> : <Moon size={18} />}</button>}
          <button
            type="button"
            onClick={onExit}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to dashboard
          </button>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-[1500px] p-4 sm:p-6 lg:p-8">
        {children}
      </div>
    </section>
  );
}
