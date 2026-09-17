import { CalendarClock, ClipboardCheck, MapPin, UsersRound } from 'lucide-react';

import type { VivaStudentResultDto } from '../../lib/vivaResults';
import type { VivaStudentSessionDto } from '../../lib/vivaScheduling';
import { Badge, DashboardPanel, EmptyState, SectionHeader } from '../ui';
import StudentVivaResults from './StudentVivaResults';

export default function StudentVivaWorkspace({
  results,
  sessions,
}: {
  results: VivaStudentResultDto[];
  sessions: VivaStudentSessionDto[];
}) {
  const formatLocal = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Unavailable';
  };
  return (
    <div className="space-y-6">
      {sessions.length > 0 && (
        <DashboardPanel className="overflow-hidden">
          <SectionHeader
            title="Your Viva sessions"
            description="Your panel, room, and time are confirmed here. Arrive ready a few minutes early."
          />
          <div className="grid gap-4 lg:grid-cols-2">
            {sessions.map((session) => (
              <article key={session.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[var(--color-text)]">{session.roundName}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">Panel host: {session.panel.admin.name}</p>
                  </div>
                  <Badge variant={session.phase === 'cancelled' ? 'warning' : session.phase === 'completed' ? 'success' : 'accent'}>{session.phase}</Badge>
                </div>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex gap-3">
                    <CalendarClock className="mt-0.5 shrink-0 text-[var(--color-accent)]" size={18} aria-hidden="true" />
                    <div><dt className="font-semibold text-[var(--color-text)]">When</dt><dd className="mt-0.5 text-[var(--color-text-muted)]">{formatLocal(session.scheduledAt)} to {formatLocal(session.vivaEndsAt)}</dd></div>
                  </div>
                  <div className="flex gap-3">
                    <MapPin className="mt-0.5 shrink-0 text-[var(--color-accent)]" size={18} aria-hidden="true" />
                    <div><dt className="font-semibold text-[var(--color-text)]">Room</dt><dd className="mt-0.5 text-[var(--color-text-muted)]">{session.locationLabel}</dd></div>
                  </div>
                  <div className="flex gap-3">
                    <UsersRound className="mt-0.5 shrink-0 text-[var(--color-accent)]" size={18} aria-hidden="true" />
                    <div><dt className="font-semibold text-[var(--color-text)]">Panel</dt><dd className="mt-0.5 text-[var(--color-text-muted)]">{session.panel.members.map((member) => member.name).join(', ')}</dd></div>
                  </div>
                </dl>
                {session.phase === 'cancelled' && <p className="mt-5 rounded-xl bg-[var(--color-danger-soft)] px-3 py-2 text-sm font-semibold text-[var(--color-danger)]">Cancelled: {session.cancellationReason || 'Contact administration for details.'}</p>}
              </article>
            ))}
          </div>
        </DashboardPanel>
      )}
      {results.length === 0 && sessions.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={24} />}
          title="No Viva session yet"
          description="Your session details and final grade will appear here after your Viva is scheduled and completed."
        />
      ) : results.length > 0 ? (
        <StudentVivaResults results={results} />
      ) : null}
    </div>
  );
}
