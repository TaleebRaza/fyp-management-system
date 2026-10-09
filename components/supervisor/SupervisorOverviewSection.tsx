'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui';
import type { ProjectQueueFilter, SupervisorDashboardStats } from './supervisorDashboardTypes';

type VivaPreview = { id: string; scheduledAt: string; project: { title: string }; phase: string };

export default function SupervisorOverviewSection({
  stats,
  migrationCode,
  onOpenProjects,
  onOpenViva,
}: {
  stats: SupervisorDashboardStats;
  migrationCode: string;
  onOpenProjects: (filter: ProjectQueueFilter) => void;
  onOpenViva: () => void;
}) {
  const [sessions, setSessions] = useState<VivaPreview[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dashboard/supervisor/viva?preview=1', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body: { sessions?: VivaPreview[] }) => setSessions(Array.isArray(body.sessions) ? body.sessions.filter((session) => session && typeof session.id === 'string' && typeof session.scheduledAt === 'string' && typeof session.project?.title === 'string') : []))
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); });
    return () => controller.abort();
  }, []);

  const upcoming = sessions?.filter((session) => session.phase !== 'completed').sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt)).slice(0, 3);
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
        <p className="text-xs font-semibold text-[var(--color-text-muted)]">Your review queue</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          {stats.reviewQueue ? `${stats.reviewQueue} document${stats.reviewQueue === 1 ? '' : 's'} waiting for review` : 'All reviews are up to date'}
        </h2>
        <p className="mt-2 max-w-[56ch] text-sm leading-6 text-[var(--color-text-muted)]">
          {stats.reviewQueue ? 'Open the queue to read submissions and respond to students.' : 'You can check assigned projects or wait for the next student submission.'}
        </p>
        <Button className="mt-5" onClick={() => onOpenProjects(stats.reviewQueue ? 'review' : 'all')}>{stats.reviewQueue ? 'Review documents' : 'View projects'}<ArrowRight size={16} /></Button>
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'Assigned teams', value: stats.assigned },
          { label: 'Submitted documents', value: stats.submitted },
          { label: 'Approved', value: stats.approved },
        ].map((item) => <div key={item.label} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6"><strong className="block text-3xl font-semibold tabular-nums">{item.value}</strong><span className="mt-2 block text-sm text-[var(--color-text-muted)]">{item.label}</span></div>)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">Assigned Viva sessions</h3><button type="button" onClick={onOpenViva} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">View all <ArrowRight size={14} /></button></div>
          {loadFailed ? <p className="mt-4 text-sm text-[var(--color-danger)]">Viva sessions are unavailable. Open Viva Sessions to retry.</p> : sessions === null ? <p className="mt-4 text-sm text-[var(--color-text-muted)]">Loading sessions...</p> : upcoming?.length ? <ul className="mt-3 space-y-3">{upcoming.map((session) => <li key={session.id} className="border-t border-[var(--color-border)] pt-3"><p className="truncate text-sm font-medium">{session.project.title || 'Untitled project'}</p><p className="mt-1 text-xs text-[var(--color-text-muted)]">{new Date(session.scheduledAt).toLocaleString()}</p></li>)}</ul> : <p className="mt-4 text-sm text-[var(--color-text-muted)]">No upcoming Viva sessions assigned.</p>}
        </section>
        <section className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="text-base font-semibold">Migration code</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Share this code with a supervisor who needs to transfer a student to you.</p>
          <code className="mt-5 block break-all text-2xl font-semibold tracking-wider text-[var(--color-text)]">{migrationCode || 'Unavailable'}</code>
        </section>
      </div>
    </div>
  );
}
