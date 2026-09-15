export const VIVA_GRADE_SCALE = [
  { grade: 'A+', percentage: 100 },
  { grade: 'A', percentage: 90 },
  { grade: 'B', percentage: 80 },
  { grade: 'C', percentage: 70 },
  { grade: 'D', percentage: 60 },
  { grade: 'F', percentage: 0 },
] as const;

export type VivaGrade = (typeof VIVA_GRADE_SCALE)[number]['grade'];
export type VivaGradeResult = (typeof VIVA_GRADE_SCALE)[number];

export const VIVA_PHASES = ['scheduled', 'running', 'completed', 'cancelled'] as const;

export type VivaPhase = (typeof VIVA_PHASES)[number];

export type VivaConfiguration = {
  targetPanelSize: number;
  minimumPanelSize: number;
  vivaDurationMinutes: number;
};

export type VivaConfigurationError =
  | 'invalid-configuration'
  | 'invalid-target-panel-size'
  | 'invalid-minimum-panel-size'
  | 'invalid-panel-sizes'
  | 'invalid-viva-duration';

export type VivaConfigurationValidation =
  | { success: true; configuration: VivaConfiguration }
  | { success: false; errors: VivaConfigurationError[] };

export type VivaSessionTimeline = {
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
};

export type VivaPublication = {
  publishedAt: Date | null;
};

export type VivaGradeChangePermission =
  | { permitted: true; result: VivaGradeResult }
  | { permitted: false; reason: 'invalid-grade' | 'outside-grading-period' | 'result-finalized' };

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

function normalizedId(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const id = value.trim();
  return id ? id : null;
}

export function validateVivaConfiguration(value: unknown): VivaConfigurationValidation {
  if (!isRecord(value)) {
    return { success: false, errors: ['invalid-configuration'] };
  }

  const errors: VivaConfigurationError[] = [];
  const targetPanelSize = value.targetPanelSize;
  const minimumPanelSize = value.minimumPanelSize;
  const vivaDurationMinutes = value.vivaDurationMinutes;

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

  if (errors.length > 0) return { success: false, errors };
  if (
    !isPanelSize(targetPanelSize)
    || !isPanelSize(minimumPanelSize)
    || !isPositiveDuration(vivaDurationMinutes)
  ) {
    return { success: false, errors: ['invalid-configuration'] };
  }

  return {
    success: true,
    configuration: { targetPanelSize, minimumPanelSize, vivaDurationMinutes },
  };
}

export function calculateVivaPhase(timeline: VivaSessionTimeline): VivaPhase {
  if (validDateTimestamp(timeline.cancelledAt) !== null) return 'cancelled';
  if (validDateTimestamp(timeline.completedAt) !== null) return 'completed';
  return validDateTimestamp(timeline.startedAt) === null ? 'scheduled' : 'running';
}

export function isVivaTerminalPhase(phase: VivaPhase): boolean {
  return phase === 'completed' || phase === 'cancelled';
}

export function isVivaPublished(publication: VivaPublication): boolean {
  return validDateTimestamp(publication.publishedAt) !== null;
}

export function isVivaGrade(value: unknown): value is VivaGrade {
  return VIVA_GRADE_SCALE.some(({ grade }) => grade === value);
}

export function getVivaGradeResult(value: unknown): VivaGradeResult | null {
  return VIVA_GRADE_SCALE.find(({ grade }) => grade === value) || null;
}

export function getVivaGradeChangePermission(
  phase: VivaPhase,
  proposedGrade: unknown
): VivaGradeChangePermission {
  const result = getVivaGradeResult(proposedGrade);
  if (!result) return { permitted: false, reason: 'invalid-grade' };
  if (phase === 'completed') return { permitted: false, reason: 'result-finalized' };
  if (phase !== 'running') return { permitted: false, reason: 'outside-grading-period' };
  return { permitted: true, result };
}

export function isVivaPanelAdmin(memberIds: readonly unknown[], panelAdminId: unknown): boolean {
  const normalizedMemberIds = memberIds.map(normalizedId);
  const adminId = normalizedId(panelAdminId);

  return Boolean(
    adminId
    && normalizedMemberIds.length > 0
    && normalizedMemberIds.every((memberId) => memberId)
    && new Set(normalizedMemberIds).size === normalizedMemberIds.length
    && normalizedMemberIds.includes(adminId)
  );
}
