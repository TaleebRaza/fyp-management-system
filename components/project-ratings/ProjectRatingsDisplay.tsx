import {
  getCompletedProjectRatingRounds,
  PROJECT_RATING_CATEGORIES,
  type ProjectRatingRound,
  type ProjectRatings,
} from '../../config/projectRatings';

const ROUND_LABELS: Record<ProjectRatingRound, string> = {
  proposal: 'Proposal ratings',
  thesis: 'Thesis ratings',
};

function formatRatingDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function ProjectRatingsDisplay({
  ratings,
  stage,
}: {
  ratings?: ProjectRatings;
  stage: string;
}) {
  const completedRounds = getCompletedProjectRatingRounds(stage);
  if (completedRounds.length === 0) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {completedRounds.map((round) => {
        const snapshot = ratings?.[round];

        return (
          <section
            key={round}
            aria-labelledby={`${round}-ratings-title`}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`${round}-ratings-title`} className="text-sm font-bold text-[var(--color-text)]">
                {ROUND_LABELS[round]}
              </h3>
              {snapshot ? (
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">
                  {formatRatingDate(snapshot.ratedAt)}
                </p>
              ) : null}
            </div>

            {snapshot ? (
              <dl className="mt-3 space-y-2">
                {PROJECT_RATING_CATEGORIES.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-4 text-sm">
                    <dt className="text-[var(--color-text-muted)]">{label}</dt>
                    <dd className="font-bold text-[var(--color-text)]">{snapshot[key]} / 10</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm font-semibold text-[var(--color-text-muted)]">
                Not rated (legacy approval)
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
