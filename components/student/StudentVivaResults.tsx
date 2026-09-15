import { GraduationCap } from 'lucide-react';

import type { VivaPublishedResult } from './studentDashboardTypes';
import { Badge, DashboardPanel, SectionHeader } from '../ui';

function formatPublishedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Published date unavailable';

  return new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function StudentVivaResults({ results }: { results: VivaPublishedResult[] }) {
  if (results.length === 0) return null;

  return (
    <DashboardPanel>
      <SectionHeader
        title="Published Viva Results"
        description="Your team receives the same final grade for each published Viva round."
      />
      <div className="space-y-3">
        {results.map((result) => (
          <div key={result.assessmentId} className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <GraduationCap size={20} />
              </div>
              <div>
                <p className="font-bold text-[var(--color-text)]">{result.roundName}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">Published {formatPublishedAt(result.publishedAt)}</p>
              </div>
            </div>
            <Badge variant="success">{result.grade} ({result.percentage}%)</Badge>
          </div>
        ))}
      </div>
    </DashboardPanel>
  );
}
