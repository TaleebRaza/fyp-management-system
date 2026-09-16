import { GraduationCap } from 'lucide-react';

import type { VivaPublishedResult } from './studentDashboardTypes';
import { Badge, DashboardPanel, SectionHeader } from '../ui';

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Published date unavailable';

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function StudentVivaResults({ results }: { results: VivaPublishedResult[] }) {
  if (results.length === 0) return null;

  return (
    <DashboardPanel className="overflow-hidden">
      <SectionHeader
        title="Published Viva Results"
        description={`${results.length} published ${results.length === 1 ? 'result' : 'results'}. Your team receives the same final grade for each Viva round.`}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {results.map((result) => (
          <article key={result.assessmentId} className="flex min-w-0 flex-col justify-between gap-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <GraduationCap size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[var(--color-text)]">{result.roundName}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Published {formatPublishedAt(result.publishedAt)}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
              <span className="text-sm font-semibold text-[var(--color-text-muted)]">Final result</span>
              <Badge variant="success" className="px-3 py-1.5 text-sm">{result.grade} ({result.percentage}%)</Badge>
            </div>
          </article>
        ))}
      </div>
    </DashboardPanel>
  );
}
