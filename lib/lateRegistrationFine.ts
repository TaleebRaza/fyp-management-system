import { APP_SETTINGS } from '../config/appSettings';
import type { LateFineAccrualPolicy } from '../types/registrationPolicy';

type LateRegistrationAssessment = {
  daysLate: number;
  fineAmount: number;
};

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) {
    throw new Error('Late-registration DEADLINE_DATE must use YYYY-MM-DD format.');
  }

  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  const validationDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  if (
    validationDate.getUTCFullYear() !== parsed.year ||
    validationDate.getUTCMonth() + 1 !== parsed.month ||
    validationDate.getUTCDate() !== parsed.day
  ) {
    throw new Error('Late-registration DEADLINE_DATE is not a valid calendar date.');
  }
  return parsed;
}

function getCalendarDateInTimeZone(date: Date, timeZone: string): CalendarDate {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    year: Number(values.get('year')),
    month: Number(values.get('month')),
    day: Number(values.get('day')),
  };
}

function toCalendarDayNumber(date: CalendarDate) {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / MILLISECONDS_PER_DAY);
}

export function calculateLateRegistrationFine(
  effectiveRegistrationAt: Date | string | number = new Date(),
  accrual?: Partial<LateFineAccrualPolicy> | null
): LateRegistrationAssessment {
  const policy = APP_SETTINGS.LATE_REGISTRATION;
  if (!policy.ENABLED) {
    return { daysLate: 0, fineAmount: 0 };
  }

  const effectiveDate = new Date(effectiveRegistrationAt);
  if (Number.isNaN(effectiveDate.getTime())) {
    throw new Error('A valid effective registration date is required.');
  }

  const finePerDay = Math.max(Math.trunc(Number(policy.FINE_PER_DAY) || 0), 0);
  const deadlineDate = parseDateOnly(policy.DEADLINE_DATE);
  const deadlineDayNumber = toCalendarDayNumber(deadlineDate);
  const frozenDays = Math.max(Math.trunc(Number(accrual?.frozenDays) || 0), 0);
  const frozenAmount = Math.max(Math.round(Number(accrual?.frozenAmount) || 0), 0);

  if (accrual?.paused === true) {
    return { daysLate: frozenDays, fineAmount: frozenAmount };
  }

  if (accrual?.resumedAt) {
    const resumedAt = new Date(accrual.resumedAt);
    if (!Number.isNaN(resumedAt.getTime())) {
      const effectiveCalendarDate = getCalendarDateInTimeZone(effectiveDate, policy.TIME_ZONE);
      const resumedCalendarDate = getCalendarDateInTimeZone(resumedAt, policy.TIME_ZONE);
      const activeStartDay = Math.max(
        toCalendarDayNumber(resumedCalendarDate),
        deadlineDayNumber
      );
      const activeDaysSinceResume = Math.max(
        toCalendarDayNumber(effectiveCalendarDate) - activeStartDay,
        0
      );
      return {
        daysLate: frozenDays + activeDaysSinceResume,
        fineAmount: frozenAmount + activeDaysSinceResume * finePerDay,
      };
    }
  }

  const effectiveCalendarDate = getCalendarDateInTimeZone(effectiveDate, policy.TIME_ZONE);
  const daysLate = Math.max(
    toCalendarDayNumber(effectiveCalendarDate) - toCalendarDayNumber(deadlineDate),
    0
  );
  return {
    daysLate,
    fineAmount: daysLate * finePerDay,
  };
}
