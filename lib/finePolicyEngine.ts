import type {
  FineCalculationInput,
  FineCalculationResult,
  FineLiabilityMode,
  FinePausePeriod,
  FineRestriction,
  FineStatus,
} from '../types/fines';
import { TERMINAL_FINE_STATUSES } from '../types/fines';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

type DayRange = {
  start: number;
  end: number;
};

type LiabilityShare = {
  studentId: string;
  numerator: number;
  denominator: number;
  index: number;
};

export type DeadlinePreviewFine = {
  id: string;
  studentId: string;
  status: FineStatus;
  currentAmount: number;
  deadline: Date | string | number;
  pausePeriods?: FinePausePeriod[];
  accrualStoppedAt?: Date | string | number | null;
  imposedAmount?: number;
  liabilityShareNumerator?: number;
  liabilityShareDenominator?: number;
  liabilityShareIndex?: number;
};

export type DeadlineChangePreview = {
  affectedStudents: number;
  previousDeadline: string | null;
  newDeadline: string;
  previousTotalAmount: number;
  projectedTotalAmount: number;
  increases: number;
  decreases: number;
  becomesZero: number;
  fines: Array<{
    fineId: string;
    studentId: string;
    previousAmount: number;
    projectedAmount: number;
    projectedLateDays: number;
  }>;
};

function validDate(value: Date | string | number, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

function calendarDate(date: Date, timeZone: string): CalendarDate {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  } catch {
    throw new Error('Fine policy time zone is invalid.');
  }

  const values = new Map(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: values.get('year') || 0,
    month: values.get('month') || 0,
    day: values.get('day') || 0,
  };
}

function dayNumber(date: Date, timeZone: string) {
  const value = calendarDate(date, timeZone);
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / MILLISECONDS_PER_DAY);
}

function nonNegativeInteger(value: unknown) {
  return Math.max(Math.round(Number(value) || 0), 0);
}

function mergeRanges(ranges: DayRange[]) {
  const ordered = ranges.toSorted((left, right) => left.start - right.start);
  const merged: DayRange[] = [];

  for (const range of ordered) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end + 1) {
      merged.push({ ...range });
    } else {
      previous.end = Math.max(previous.end, range.end);
    }
  }
  return merged;
}

function countPausedDays(
  pausePeriods: FinePausePeriod[],
  firstLateDay: number,
  effectiveDay: number,
  timeZone: string
) {
  const ranges = pausePeriods.flatMap((period): DayRange[] => {
    const startedAt = validDate(period.startedAt, 'Pause start');
    const pauseStart = dayNumber(startedAt, timeZone);
    const pauseEndExclusive = period.endedAt
      ? dayNumber(validDate(period.endedAt, 'Pause end'), timeZone)
      : effectiveDay + 1;
    const start = Math.max(firstLateDay, pauseStart);
    const end = Math.min(effectiveDay, pauseEndExclusive - 1);
    return start <= end ? [{ start, end }] : [];
  });

  return mergeRanges(ranges).reduce((total, range) => total + range.end - range.start + 1, 0);
}

export function calculateFine(input: FineCalculationInput): FineCalculationResult {
  const deadline = validDate(input.deadline, 'Fine deadline');
  const effectiveAt = validDate(input.accrualStoppedAt || input.effectiveAt, 'Fine calculation date');
  const timeZone = String(input.timeZone || 'Asia/Karachi').trim() || 'Asia/Karachi';
  const gracePeriodDays = nonNegativeInteger(input.gracePeriodDays);
  const firstLateDay = dayNumber(deadline, timeZone) + gracePeriodDays + 1;
  const effectiveDay = dayNumber(effectiveAt, timeZone);
  const elapsedLateDays = Math.max(effectiveDay - firstLateDay + 1, 0);
  const pausedDays = countPausedDays(
    input.pausePeriods || [],
    firstLateDay,
    effectiveDay,
    timeZone
  );
  const lateDays = Math.max(elapsedLateDays - pausedDays, 0);
  const fixedAmount = nonNegativeInteger(input.fixedAmount);
  const startingAmount = nonNegativeInteger(input.startingAmount);
  const dailyAmount = nonNegativeInteger(input.dailyAmount);

  const imposedAmount = nonNegativeInteger(input.imposedAmount);
  let originalAmount = imposedAmount;
  let accruedAmount = 0;
  if (lateDays > 0) {
    if (input.method === 'fixed') {
      originalAmount = Math.max(imposedAmount, fixedAmount);
    } else if (input.method === 'daily') {
      accruedAmount = dailyAmount * lateDays;
    } else if (input.method === 'starting-plus-daily') {
      originalAmount = Math.max(imposedAmount, startingAmount);
      accruedAmount = dailyAmount * lateDays;
    } else {
      throw new Error('Fine calculation method is invalid.');
    }
  }

  const uncappedAmount = originalAmount + accruedAmount;
  const maximumAmount = input.maximumAmount == null
    ? null
    : nonNegativeInteger(input.maximumAmount);
  const currentAmount = maximumAmount == null
    ? uncappedAmount
    : Math.min(uncappedAmount, maximumAmount);
  const cappedAccruedAmount = Math.max(currentAmount - Math.min(originalAmount, currentAmount), 0);

  return {
    originalAmount: Math.min(originalAmount, currentAmount),
    currentAmount,
    accruedAmount: cappedAccruedAmount,
    lateDays,
  };
}

export function fineStatusForCalculation(
  calculation: FineCalculationResult,
  input: Pick<FineCalculationInput, 'deadline' | 'effectiveAt' | 'gracePeriodDays' | 'timeZone' | 'pausePeriods' | 'accrualStoppedAt' | 'imposedAmount'>
): FineStatus {
  const timeZone = String(input.timeZone || 'Asia/Karachi').trim() || 'Asia/Karachi';
  const effectiveAt = validDate(input.effectiveAt, 'Fine calculation date');
  const deadline = validDate(input.deadline, 'Fine deadline');
  const dueDay = dayNumber(deadline, timeZone) + nonNegativeInteger(input.gracePeriodDays);
  if (dayNumber(effectiveAt, timeZone) <= dueDay) {
    return nonNegativeInteger(input.imposedAmount) > 0 ? 'pending-payment' : 'scheduled';
  }
  if (input.accrualStoppedAt) return 'pending-payment';
  if ((input.pausePeriods || []).some((period) => !period.endedAt)) return 'paused';
  return calculation.currentAmount > 0 ? 'accruing' : 'pending-payment';
}

const STATUS_TRANSITIONS: Record<FineStatus, readonly FineStatus[]> = {
  scheduled: ['accruing', 'paused', 'pending-payment', 'waived', 'cancelled', 'disputed'],
  accruing: ['paused', 'pending-payment', 'payment-submitted', 'waived', 'cancelled', 'disputed'],
  paused: ['accruing', 'pending-payment', 'payment-submitted', 'waived', 'cancelled', 'disputed'],
  'pending-payment': ['payment-submitted', 'under-verification', 'paid', 'waived', 'cancelled', 'disputed'],
  'payment-submitted': ['under-verification', 'pending-payment', 'paid', 'waived', 'cancelled', 'disputed'],
  'under-verification': ['paid', 'payment-submitted', 'pending-payment', 'waived', 'cancelled', 'disputed'],
  paid: [],
  waived: [],
  cancelled: [],
  disputed: ['accruing', 'paused', 'pending-payment', 'payment-submitted', 'under-verification', 'waived', 'cancelled'],
};

export function canTransitionFineStatus(from: FineStatus, to: FineStatus) {
  return from === to || STATUS_TRANSITIONS[from].includes(to);
}

export function assertFineStatusTransition(from: FineStatus, to: FineStatus) {
  if (!canTransitionFineStatus(from, to)) {
    throw new Error(`Fine status cannot change from ${from} to ${to}.`);
  }
}

export function isTerminalFineStatus(status: FineStatus) {
  return TERMINAL_FINE_STATUSES.includes(status);
}

export function normalizeRestrictionSet(restrictions: FineRestriction[]) {
  const unique = [...new Set(restrictions)];
  if (unique.includes('none') && unique.length > 1) {
    throw new Error('No Operational Restriction cannot be combined with another restriction.');
  }
  return unique;
}

export function resolveLiabilityShares(
  memberIds: string[],
  triggeringStudentId: string,
  mode: FineLiabilityMode
): LiabilityShare[] {
  const members = [...new Set(memberIds.filter(Boolean))];
  if (!members.includes(triggeringStudentId)) members.unshift(triggeringStudentId);
  if (mode === 'individual') {
    return [{ studentId: triggeringStudentId, numerator: 1, denominator: 1, index: 0 }];
  }
  if (mode === 'all-members') {
    return members.map((studentId) => ({ studentId, numerator: 1, denominator: 1, index: 0 }));
  }
  return members.map((studentId, index) => ({
    studentId,
    numerator: 1,
    denominator: members.length,
    index,
  }));
}

export function applyLiabilityShare(
  amount: number,
  numerator: number,
  denominator: number,
  index = 0
) {
  if (
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    !Number.isInteger(index) ||
    numerator < 0 ||
    denominator < 1 ||
    index < 0 ||
    index >= denominator
  ) {
    throw new Error('Fine liability share is invalid.');
  }
  const scaledAmount = nonNegativeInteger(amount) * numerator;
  return Math.floor(scaledAmount / denominator) + (index < scaledAmount % denominator ? 1 : 0);
}

export function policyAppliesToStudent(
  policy: { applicablePrograms?: string[]; applicableBatches?: string[]; effectiveFrom: Date | string | number },
  student: { program?: string | null; batch?: string | null },
  eventAt: Date | string | number
) {
  const programs = policy.applicablePrograms || [];
  const batches = policy.applicableBatches || [];
  return (
    validDate(eventAt, 'Fine event date').getTime() >= validDate(policy.effectiveFrom, 'Policy effective date').getTime() &&
    (programs.length === 0 || programs.includes(String(student.program || ''))) &&
    (batches.length === 0 || batches.includes(String(student.batch || '')))
  );
}

export function nextFinePolicyVersion(latestVersion: unknown) {
  const version = Number(latestVersion || 0);
  if (!Number.isInteger(version) || version < 0) throw new Error('Latest fine policy version is invalid.');
  return version + 1;
}

export function buildFineDeduplicationKey(input: {
  studentId: string;
  fineTypeId: string;
  projectStage?: string | null;
  policyVersion: number;
  generationKey: string;
}) {
  const studentId = String(input.studentId || '').trim();
  const fineTypeId = String(input.fineTypeId || '').trim();
  const generationKey = String(input.generationKey || '').trim();
  const policyVersion = Number(input.policyVersion);
  if (!studentId || !fineTypeId || !generationKey || !Number.isInteger(policyVersion) || policyVersion < 1) {
    throw new Error('Fine deduplication fields are invalid.');
  }
  const projectStage = String(input.projectStage || '').trim() || `manual:${generationKey}`;
  return [studentId, fineTypeId, projectStage, policyVersion].join(':');
}

export function previewDeadlineChange(
  fines: DeadlinePreviewFine[],
  calculation: Omit<FineCalculationInput, 'deadline' | 'effectiveAt' | 'pausePeriods' | 'accrualStoppedAt'>,
  newDeadline: Date | string | number,
  effectiveAt: Date | string | number
): DeadlineChangePreview {
  const unresolved = fines.filter((fine) => !isTerminalFineStatus(fine.status));
  const projected = unresolved.map((fine) => {
    const result = calculateFine({
      ...calculation,
      deadline: newDeadline,
      effectiveAt,
      pausePeriods: fine.pausePeriods,
      accrualStoppedAt: fine.accrualStoppedAt,
      imposedAmount: fine.imposedAmount,
    });
    const projectedAmount = applyLiabilityShare(
      result.currentAmount,
      fine.liabilityShareNumerator || 1,
      fine.liabilityShareDenominator || 1,
      fine.liabilityShareIndex || 0
    );
    return {
      fineId: fine.id,
      studentId: fine.studentId,
      previousAmount: nonNegativeInteger(fine.currentAmount),
      projectedAmount,
      projectedLateDays: result.lateDays,
    };
  });

  const previousDeadlines = new Set(unresolved.map((fine) => validDate(fine.deadline, 'Fine deadline').toISOString()));
  return {
    affectedStudents: new Set(projected.map((fine) => fine.studentId)).size,
    previousDeadline: previousDeadlines.size === 1 ? [...previousDeadlines][0] : null,
    newDeadline: validDate(newDeadline, 'New deadline').toISOString(),
    previousTotalAmount: projected.reduce((total, fine) => total + fine.previousAmount, 0),
    projectedTotalAmount: projected.reduce((total, fine) => total + fine.projectedAmount, 0),
    increases: projected.filter((fine) => fine.projectedAmount > fine.previousAmount).length,
    decreases: projected.filter((fine) => fine.projectedAmount < fine.previousAmount).length,
    becomesZero: projected.filter((fine) => fine.previousAmount > 0 && fine.projectedAmount === 0).length,
    fines: projected,
  };
}
