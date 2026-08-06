'use client';

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CircleX,
  MessageSquareWarning,
  PartyPopper,
  Sparkles,
  X,
} from 'lucide-react';

type ReviewOutcome = 'Approved' | 'Changes Requested' | 'Rejected';

type StudentReviewOutcomeScreenProps = {
  userId: string;
  projectId?: string;
  projectVersion?: number;
  status?: string;
  remarks?: string;
};

type OutcomeConfig = {
  title: string;
  message: string;
  label: string;
  Icon: LucideIcon;
  screenClassName: string;
  panelClassName: string;
  buttonClassName: string;
};

const OUTCOME_CONFIG: Record<ReviewOutcome, OutcomeConfig> = {
  Approved: {
    title: 'Your project has been approved',
    message: 'Your supervisor approved this submission. You can continue from your dashboard.',
    label: 'Project approved',
    Icon: PartyPopper,
    screenClassName: 'bg-emerald-900 text-emerald-50',
    panelClassName: 'border-emerald-200/30 bg-emerald-950/30',
    buttonClassName: 'bg-white text-emerald-900 hover:bg-emerald-50',
  },
  'Changes Requested': {
    title: 'Changes have been requested',
    message: 'Review the remarks below, update your project, and submit the next version.',
    label: 'Supervisor feedback',
    Icon: MessageSquareWarning,
    screenClassName: 'bg-amber-300 text-amber-950',
    panelClassName: 'border-amber-950/20 bg-amber-100/60',
    buttonClassName: 'bg-amber-950 text-amber-50 hover:bg-amber-900',
  },
  Rejected: {
    title: 'Your project was rejected',
    message: 'Read the supervisor remarks below before preparing a revised submission.',
    label: 'Project rejected',
    Icon: CircleX,
    screenClassName: 'bg-red-900 text-red-50',
    panelClassName: 'border-red-200/30 bg-red-950/30',
    buttonClassName: 'bg-white text-red-900 hover:bg-red-50',
  },
};

function getReviewOutcome(status?: string): ReviewOutcome | null {
  if (status === 'Approved' || status === 'Changes Requested' || status === 'Rejected') {
    return status;
  }
  return null;
}

export default function StudentReviewOutcomeScreen({
  userId,
  projectId,
  projectVersion,
  status,
  remarks,
}: StudentReviewOutcomeScreenProps) {
  const outcome = getReviewOutcome(status);
  const eventMarker =
    outcome && userId && projectId
      ? `${projectId}:${projectVersion ?? 'legacy'}:${outcome}`
      : '';
  const storageKey = `fyp-review-outcome-seen:${userId}`;
  const [storedMarker, setStoredMarker] = useState<string | null>(null);

  useEffect(() => {
    if (!eventMarker) return;

    const frame = window.requestAnimationFrame(() => {
      try {
        setStoredMarker(window.localStorage.getItem(storageKey) || '');
      } catch {
        setStoredMarker('');
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [eventMarker, storageKey]);

  if (!outcome || !eventMarker || storedMarker === null || storedMarker === eventMarker) {
    return null;
  }

  const config = OUTCOME_CONFIG[outcome];
  const Icon = config.Icon;
  const visibleRemarks = remarks?.trim() || 'No additional remarks were provided.';

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, eventMarker);
    } catch {
      // Keep the current-session dismissal working when browser storage is unavailable.
    }
    setStoredMarker(eventMarker);
  };

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-review-outcome-title"
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Tab') {
          event.preventDefault();
          event.currentTarget.querySelector('button')?.focus();
        }
      }}
      className={`fixed inset-0 z-[100] overflow-y-auto overscroll-contain ${config.screenClassName}`}
    >
      {outcome === 'Approved' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <PartyPopper className="absolute left-[8%] top-[10%] opacity-30" size={54} />
          <Sparkles className="absolute right-[10%] top-[15%] opacity-40" size={42} />
          <Sparkles className="absolute bottom-[22%] left-[14%] opacity-25" size={34} />
          <PartyPopper className="absolute bottom-[18%] right-[9%] -scale-x-100 opacity-30" size={58} />
        </div>
      )}

      <div className="relative flex min-h-full flex-col px-6 py-8 sm:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center pb-20 pt-10 text-center">
          <div className="mb-7 rounded-full border border-current/25 bg-white/10 p-5">
            <Icon size={54} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <p className="mb-3 text-sm font-black uppercase tracking-[0.24em] opacity-75">
            {config.label}
          </p>
          <h1
            id="student-review-outcome-title"
            className="max-w-2xl text-4xl font-black leading-tight sm:text-6xl"
          >
            {config.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-7 opacity-80 sm:text-lg">
            {config.message}
          </p>

          <div className={`mt-10 w-full rounded-3xl border p-6 text-left sm:p-8 ${config.panelClassName}`}>
            <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">
              Supervisor remarks
            </p>
            <p className="mt-4 whitespace-pre-wrap text-base font-semibold leading-7 sm:text-lg">
              {visibleRemarks}
            </p>
          </div>
        </div>

        <button
          type="button"
          autoFocus
          onClick={dismiss}
          aria-label="Close review result and open dashboard"
          className={`mx-auto flex h-16 w-16 shrink-0 items-center justify-center rounded-full shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-current/40 ${config.buttonClassName}`}
        >
          <X size={34} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
