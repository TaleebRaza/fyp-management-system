import { ClipboardCheck } from 'lucide-react';

import type { VivaPublishedResult } from './studentDashboardTypes';
import type { VivaStudentSessionDto } from '../../lib/vivaScheduling';
import { EmptyState } from '../ui';
import StudentVivaResults from './StudentVivaResults';

export default function StudentVivaWorkspace({
  results,
  sessions,
}: {
  results: VivaPublishedResult[];
  sessions: VivaStudentSessionDto[];
}) {
  const formatLocal = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Unavailable';
  };
  return (
    <div className="space-y-6">
      {sessions.length > 0 && <div className="space-y-3">{sessions.map((session) => <div key={session.id} className="rounded-xl border border-[var(--color-border)] p-4"><p className="font-bold text-[var(--color-text)]">{session.roundName}</p><p className="mt-1 text-sm text-[var(--color-text-muted)]">{formatLocal(session.scheduledAt)} to {formatLocal(session.vivaEndsAt)}, {session.locationLabel}</p>{session.phase === 'cancelled' && <p className="mt-1 text-sm font-semibold text-[var(--color-danger)]">Cancelled: {session.cancellationReason || 'Contact administration for details.'}</p>}</div>)}</div>}
      {results.length === 0 && sessions.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={24} />}
          title="No Viva result published yet"
          description="Your team’s Viva result will appear here after the panel completes the assessment and administration publishes it."
        />
      ) : results.length > 0 ? (
        <StudentVivaResults results={results} />
      ) : null}
    </div>
  );
}
