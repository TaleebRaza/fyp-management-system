import { APP_SETTINGS } from '../config/appSettings';

export type LateRegistrationAssessment = {
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
  effectiveRegistrationAt: Date | string | number = new Date()
): LateRegistrationAssessment {
  const policy = APP_SETTINGS.LATE_REGISTRATION;

  if (!policy.ENABLED) {
    return { daysLate: 0, fineAmount: 0 };
  }

  const effectiveDate = new Date(effectiveRegistrationAt);

  if (Number.isNaN(effectiveDate.getTime())) {
    throw new Error('A valid effective registration date is required.');
  }

  const deadlineDate = parseDateOnly(policy.DEADLINE_DATE);
  const effectiveCalendarDate = getCalendarDateInTimeZone(
    effectiveDate,
    policy.TIME_ZONE
  );

  const daysLate = Math.max(
    toCalendarDayNumber(effectiveCalendarDate) - toCalendarDayNumber(deadlineDate),
    0
  );

  const finePerDay = Math.max(Math.trunc(Number(policy.FINE_PER_DAY) || 0), 0);

  return {
    daysLate,
    fineAmount: daysLate * finePerDay,
  };
}