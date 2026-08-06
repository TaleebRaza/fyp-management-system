import { Star } from 'lucide-react';

import {
  PROJECT_RATING_CATEGORIES,
  PROJECT_RATING_VALUES,
  type ProjectRatingCategoryKey,
  type ProjectRatingValues,
} from '../../config/projectRatings';
import { TextArea } from '../ui';

export type PendingProjectRatings = Partial<ProjectRatingValues>;

export function ApprovalRatingForm({
  ratings,
  remarks,
  stageLabel,
  version,
  disabled,
  onRatingChange,
  onRemarksChange,
}: {
  ratings: PendingProjectRatings;
  remarks: string;
  stageLabel: string;
  version: number;
  disabled: boolean;
  onRatingChange: (category: ProjectRatingCategoryKey, value: number) => void;
  onRemarksChange: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-[var(--color-text)]">Approve this submission</h3>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          You are approving the {stageLabel} submission at review version {version}. Select a score
          for every category; ratings are saved permanently with this approval.
        </p>
      </div>

      {PROJECT_RATING_CATEGORIES.map(({ key, label }) => {
        const selectedValue = ratings[key];

        return (
          <fieldset key={key} disabled={disabled} className="min-w-0">
            <legend className="text-sm font-bold text-[var(--color-text)]">{label}</legend>
            <div className="-mt-5 mb-2 flex justify-end">
              <output
                className="text-sm font-bold tabular-nums text-[var(--color-text)]"
                aria-live="polite"
              >
                {selectedValue ? `${selectedValue} out of 10` : 'Not selected'}
              </output>
            </div>
            <div className="flex flex-wrap gap-1" aria-label={`${label} rating`}>
              {PROJECT_RATING_VALUES.map((value) => (
                <label key={value} className="cursor-pointer rounded-md">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name={`rating-${key}`}
                    value={value}
                    checked={selectedValue === value}
                    onChange={() => onRatingChange(key, value)}
                    aria-label={`${label}: ${value} out of 10`}
                    required
                  />
                  <span className="grid h-8 w-8 place-items-center rounded-md text-amber-400 transition hover:bg-amber-400/10 peer-focus-visible:ring-2 peer-focus-visible:ring-amber-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--color-surface)]">
                    <Star
                      aria-hidden="true"
                      size={22}
                      fill={selectedValue && value <= selectedValue ? 'currentColor' : 'none'}
                    />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      <label className="block">
        <span className="mb-2 block text-sm font-bold text-[var(--color-text)]">
          Remarks <span className="font-normal text-[var(--color-text-muted)]">(optional)</span>
        </span>
        <TextArea
          value={remarks}
          disabled={disabled}
          maxLength={2000}
          placeholder="Write remarks for this team..."
          onChange={(event) => onRemarksChange(event.target.value)}
        />
      </label>
    </div>
  );
}
