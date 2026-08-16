import type { FormEvent } from 'react';
import { Download, Loader2 } from 'lucide-react';

import {
  PROJECT_RATING_CATEGORIES,
  type ProjectRatingCategoryKey,
  type ProjectRatingRound,
  type ProjectRatingsExportFilters,
} from '../../../config/projectRatings';
import { Button, Select, StyledInput } from '../../ui';

export function ProjectRatingsExportForm({
  filters,
  isDownloading,
  onRoundChange,
  onMinimumChange,
  onDownload,
}: {
  filters: ProjectRatingsExportFilters;
  isDownloading: boolean;
  onRoundChange: (round: ProjectRatingRound) => void;
  onMinimumChange: (category: ProjectRatingCategoryKey, value: number) => void;
  onDownload: () => void;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onDownload();
  };

  return (
    <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--color-text)]">
        Project Ratings Export
      </summary>
      <div className="border-t border-[var(--color-border)] p-4">
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">
          Download a formatted PDF with one student entry per matching row. A minimum of zero leaves that category unfiltered.
        </p>

        <form className="mt-4 grid gap-4 lg:grid-cols-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Rating round</span>
            <Select
              value={filters.round}
              disabled={isDownloading}
              onChange={(event) => {
                const round = event.target.value;
                if (round === 'proposal' || round === 'thesis') onRoundChange(round);
              }}
            >
              <option value="proposal">Proposal</option>
              <option value="thesis">Thesis</option>
            </Select>
          </label>

          {PROJECT_RATING_CATEGORIES.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Minimum {label}
              </span>
              <StyledInput
                type="number"
                min={0}
                max={10}
                step={1}
                required
                disabled={isDownloading}
                value={filters.minimums[key]}
                onChange={(event) => onMinimumChange(key, Number(event.target.value))}
              />
            </label>
          ))}

          <div className="lg:col-span-4">
            <Button type="submit" disabled={isDownloading}>
              {isDownloading ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {isDownloading ? 'Generating PDF...' : 'Download PDF'}
            </Button>
          </div>
        </form>
      </div>
    </details>
  );
}
