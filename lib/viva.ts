export const VIVA_PHASES = [
  'scheduled',
  'running',
  'extra_grading',
  'ended',
  'cancelled',
] as const;

export type VivaPhase = (typeof VIVA_PHASES)[number];

export type VivaFactor = {
  id: string;
  label: string;
};

export type VivaConfiguration = {
  factors: VivaFactor[];
  targetPanelSize: number;
  minimumPanelSize: number;
  vivaDurationMinutes: number;
  extraGradingDurationMinutes: number;
};

export type VivaConfigurationError =
  | 'invalid-configuration'
  | 'factors-required'
  | 'invalid-factor'
  | 'duplicate-factor-id'
  | 'invalid-target-panel-size'
  | 'invalid-minimum-panel-size'
  | 'invalid-panel-sizes'
  | 'invalid-viva-duration'
  | 'invalid-extra-grading-duration';

export type VivaConfigurationValidation =
  | { success: true; configuration: VivaConfiguration }
  | { success: false; errors: VivaConfigurationError[] };

export type VivaSessionTimeline = {
  startedAt: Date | null;
  vivaEndsAt: Date | null;
  extraGradingEndsAt: Date | null;
  cancelledAt: Date | null;
};

export type VivaPublication = {
  publishedAt: Date | null;
};

export type VivaExaminerMark = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type VivaScore =
  | { value: VivaExaminerMark; source: 'examiner' }
  | { value: 0; source: 'deadline' };

export type VivaScoreSheet = Partial<Record<string, VivaScore>>;

export type VivaScoreChangePermission =
  | { permitted: true }
  | {
      permitted: false;
      reason: 'invalid-score' | 'outside-grading-period' | 'score-locked';
    };

export type VivaAverages = {
  overall: number;
  factors: Record<string, number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isPanelSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 2;
}

function validDateTimestamp(value: Date | null): number | null {
  if (!(value instanceof Date)) return null;

  const timestamp = value.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getDistinctFactorIds(factors: readonly VivaFactor[]): string[] | null {
  if (factors.length === 0) return null;

  const factorIds = factors.map((factor) => factor?.id);
  if (factorIds.some((factorId) => typeof factorId !== 'string' || !factorId.trim())) {
    return null;
  }

  return new Set(factorIds).size === factorIds.length ? factorIds : null;
}

export function validateVivaConfiguration(value: unknown): VivaConfigurationValidation {
  if (!isRecord(value)) {
    return { success: false, errors: ['invalid-configuration'] };
  }

  const errors: VivaConfigurationError[] = [];
  const targetPanelSize = value.targetPanelSize;
  const minimumPanelSize = value.minimumPanelSize;
  const vivaDurationMinutes = value.vivaDurationMinutes;
  const extraGradingDurationMinutes = value.extraGradingDurationMinutes;
  const factors: VivaFactor[] = [];

  if (!isPanelSize(targetPanelSize)) errors.push('invalid-target-panel-size');
  if (!isPanelSize(minimumPanelSize)) errors.push('invalid-minimum-panel-size');
  if (
    isPanelSize(targetPanelSize)
    && isPanelSize(minimumPanelSize)
    && minimumPanelSize > targetPanelSize
  ) {
    errors.push('invalid-panel-sizes');
  }
  if (!isPositiveDuration(vivaDurationMinutes)) errors.push('invalid-viva-duration');
  if (!isPositiveDuration(extraGradingDurationMinutes)) errors.push('invalid-extra-grading-duration');

  if (!Array.isArray(value.factors) || value.factors.length === 0) {
    errors.push('factors-required');
  } else {
    const factorIds = new Set<string>();

    for (const candidate of value.factors) {
      if (!isRecord(candidate) || typeof candidate.id !== 'string' || typeof candidate.label !== 'string') {
        errors.push('invalid-factor');
        continue;
      }

      const id = candidate.id.trim();
      const label = candidate.label.trim();
      if (!id || !label) {
        errors.push('invalid-factor');
        continue;
      }
      if (factorIds.has(id)) {
        errors.push('duplicate-factor-id');
        continue;
      }

      factorIds.add(id);
      factors.push({ id, label });
    }
  }

  if (errors.length > 0) return { success: false, errors: [...new Set(errors)] };
  if (
    !isPanelSize(targetPanelSize)
    || !isPanelSize(minimumPanelSize)
    || !isPositiveDuration(vivaDurationMinutes)
    || !isPositiveDuration(extraGradingDurationMinutes)
  ) {
    return { success: false, errors: ['invalid-configuration'] };
  }

  return {
    success: true,
    configuration: {
      factors,
      targetPanelSize,
      minimumPanelSize,
      vivaDurationMinutes,
      extraGradingDurationMinutes,
    },
  };
}

export function calculateVivaPhase(timeline: VivaSessionTimeline, now: Date): VivaPhase {
  if (validDateTimestamp(timeline.cancelledAt) !== null) return 'cancelled';

  const startedAt = validDateTimestamp(timeline.startedAt);
  const vivaEndsAt = validDateTimestamp(timeline.vivaEndsAt);
  const extraGradingEndsAt = validDateTimestamp(timeline.extraGradingEndsAt);
  const currentTime = validDateTimestamp(now);

  if (
    startedAt === null
    || vivaEndsAt === null
    || extraGradingEndsAt === null
    || currentTime === null
    || extraGradingEndsAt < vivaEndsAt
  ) {
    return 'scheduled';
  }
  if (currentTime < vivaEndsAt) return 'running';
  if (currentTime < extraGradingEndsAt) return 'extra_grading';
  return 'ended';
}

export function isVivaPublished(publication: VivaPublication): boolean {
  return validDateTimestamp(publication.publishedAt) !== null;
}

export function isVivaExaminerMark(value: unknown): value is VivaExaminerMark {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
}

export function isVivaScore(value: unknown): value is VivaScore {
  if (!isRecord(value)) return false;
  if (value.source === 'examiner') return isVivaExaminerMark(value.value);
  return value.source === 'deadline' && value.value === 0;
}

export function getVivaScoreChangePermission(
  phase: VivaPhase,
  currentScore: VivaScore | undefined,
  proposedMark: unknown
): VivaScoreChangePermission {
  if (!isVivaExaminerMark(proposedMark)) {
    return { permitted: false, reason: 'invalid-score' };
  }
  if (phase === 'running') return { permitted: true };
  if (phase === 'extra_grading' && currentScore === undefined) return { permitted: true };
  if (phase === 'extra_grading') return { permitted: false, reason: 'score-locked' };
  return { permitted: false, reason: 'outside-grading-period' };
}

export function fillMissingVivaScores(
  factors: readonly VivaFactor[],
  scores: VivaScoreSheet
): Record<string, VivaScore> {
  const factorIds = getDistinctFactorIds(factors);
  if (!factorIds) throw new Error('Viva factors must have distinct, non-empty IDs.');

  const completedScores: Record<string, VivaScore> = {};
  for (const factorId of factorIds) {
    const score = scores[factorId];
    if (score === undefined) {
      completedScores[factorId] = { value: 0, source: 'deadline' };
    } else if (isVivaScore(score)) {
      completedScores[factorId] = score;
    } else {
      throw new Error(`Invalid viva score for factor ${factorId}.`);
    }
  }

  return completedScores;
}

export function roundVivaAverage(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateVivaAverages(
  factors: readonly VivaFactor[],
  scoreSheets: readonly VivaScoreSheet[]
): VivaAverages | null {
  const factorIds = getDistinctFactorIds(factors);
  if (!factorIds || scoreSheets.length === 0) return null;

  const factorTotals = Object.fromEntries(factorIds.map((factorId) => [factorId, 0])) as Record<string, number>;

  for (const scores of scoreSheets) {
    for (const factorId of factorIds) {
      const score = scores[factorId];
      if (!isVivaScore(score)) return null;
      factorTotals[factorId] += score.value;
    }
  }

  const factorsAverages = Object.fromEntries(
    factorIds.map((factorId) => [
      factorId,
      roundVivaAverage(factorTotals[factorId] / scoreSheets.length),
    ])
  ) as Record<string, number>;
  const total = factorIds.reduce((sum, factorId) => sum + factorTotals[factorId], 0);

  return {
    overall: roundVivaAverage(total / (factorIds.length * scoreSheets.length)),
    factors: factorsAverages,
  };
}
