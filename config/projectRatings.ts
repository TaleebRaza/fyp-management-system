export const PROJECT_RATING_CATEGORIES = [
  { key: 'projectIdea', label: 'Project Idea' },
  { key: 'technicalMerit', label: 'Technical Merit' },
  { key: 'documentationQuality', label: 'Documentation Quality' },
] as const;

export const PROJECT_RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type ProjectRatingCategoryKey = (typeof PROJECT_RATING_CATEGORIES)[number]['key'];
export type ProjectRatingRound = 'proposal' | 'thesis';
export type ProjectRatingValues = Record<ProjectRatingCategoryKey, number>;
export type ProjectRatingSnapshot = ProjectRatingValues & {
  ratedAt: string | Date;
  ratedBy?: string;
};
export type ProjectRatings = Partial<Record<ProjectRatingRound, ProjectRatingSnapshot>>;
export type ProjectRatingsExportFilters = {
  round: ProjectRatingRound;
  minimums: Record<ProjectRatingCategoryKey, number>;
};

const CATEGORY_KEYS = new Set<string>(
  PROJECT_RATING_CATEGORIES.map((category) => category.key)
);

export function getProjectRatingRound(stage: unknown): ProjectRatingRound | null {
  if (stage === 'PROPOSAL') return 'proposal';
  if (stage === 'THESIS_DRAFT') return 'thesis';
  return null;
}

export function getCompletedProjectRatingRounds(stage: unknown): ProjectRatingRound[] {
  if (stage === 'FINAL_DELIVERABLES') return ['proposal', 'thesis'];
  if (stage === 'THESIS_DRAFT') return ['proposal'];
  return [];
}

export function parseProjectRatingValues(value: unknown): ProjectRatingValues | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== PROJECT_RATING_CATEGORIES.length ||
    Object.keys(record).some((key) => !CATEGORY_KEYS.has(key))
  ) {
    return null;
  }

  for (const { key } of PROJECT_RATING_CATEGORIES) {
    const score = record[key];
    if (!Number.isInteger(score) || Number(score) < 1 || Number(score) > 10) {
      return null;
    }
  }

  return {
    projectIdea: Number(record.projectIdea),
    technicalMerit: Number(record.technicalMerit),
    documentationQuality: Number(record.documentationQuality),
  };
}

export function getSafeProjectRatings(value: unknown): ProjectRatings | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const source = value as Record<string, unknown>;
  const result: ProjectRatings = {};

  for (const round of ['proposal', 'thesis'] as const) {
    const snapshot = source[round];
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) continue;

    const record = snapshot as Record<string, unknown>;
    const scores = parseProjectRatingValues({
      projectIdea: record.projectIdea,
      technicalMerit: record.technicalMerit,
      documentationQuality: record.documentationQuality,
    });
    const ratedAt = record.ratedAt;
    if (!scores || !(typeof ratedAt === 'string' || ratedAt instanceof Date)) continue;

    result[round] = { ...scores, ratedAt };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
