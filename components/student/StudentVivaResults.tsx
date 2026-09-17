import { Award, CalendarCheck2, UsersRound } from 'lucide-react';

import type { VivaStudentResultDto } from '../../lib/vivaResults';
import { Badge, DashboardPanel, SectionHeader } from '../ui';

function formatCompletedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Completion date unavailable';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function StudentVivaResults({ results }: { results: VivaStudentResultDto[] }) {
  if (results.length === 0) return null;

  return (
    <DashboardPanel className="overflow-hidden">
      <SectionHeader
        title="Viva results"
        description={`${results.length} completed ${results.length === 1 ? 'result' : 'results'}. Your grade appears as soon as the panel completes your Viva.`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {results.map((result) => (
          <article key={result.sessionId} className="flex min-w-0 flex-col justify-between gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <Award size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[var(--color-text)]">{result.roundName}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Completed {formatCompletedAt(result.completedAt)}</p>
              </div>
            </div>
            <div className="grid gap-3 border-t border-[var(--color-border)] pt-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-[var(--color-text-muted)]">Final result</span>
                <Badge variant="success" className="px-3 py-1.5 text-sm">{result.grade} ({result.percentage}%)</Badge>
              </div>
              <div className="flex items-start gap-2 text-[var(--color-text-muted)]"><UsersRound size={16} className="mt-0.5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />Panel host: {result.panel.admin.name}</div>
              <div className="flex items-start gap-2 text-[var(--color-text-muted)]"><CalendarCheck2 size={16} className="mt-0.5 shrink-0 text-[var(--color-accent)]" aria-hidden="true" />Panel members: {result.panel.members.map((member) => member.name).join(', ')}</div>
            </div>
          </article>
        ))}
      </div>
    </DashboardPanel>
  );
}
