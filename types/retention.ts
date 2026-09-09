import { isRecord } from '../lib/security/input';

export const RETENTION_CONFIG_KEY = 'retention';
export const RETENTION_BATCH_LIMIT = 100;
export const MAX_RETENTION_AGE_DAYS = 3_650;

export type RetentionCategory = {
  enabled: boolean;
  ageDays: number;
};

export type RetentionSettings = {
  schedule: {
    enabled: boolean;
    timezone: string;
    time: string;
  };
  playedVoiceNotes: RetentionCategory;
  unplayedVoiceNotes: RetentionCategory;
  audioBroadcasts: RetentionCategory;
  unusedPdfUploads: RetentionCategory;
};

export type RetentionRunStatus =
  | 'completed'
  | 'failed'
  | 'disabled'
  | 'not-configured'
  | 'not-due'
  | 'running';

export type RetentionExecutionReport = {
  status: RetentionRunStatus;
  scheduledFor: string | null;
  completedAt: string | null;
  playedVoiceNotesDeleted: number;
  unplayedVoiceNotesDeleted: number;
  audioBroadcastsCleared: number;
  unusedPdfUploadsQueued: number;
  queuedObjects: number;
  queuedDeletionBytes: number;
  protectedSharedObjects: number;
  skippedInvalidObjects: number;
};

export type RetentionPreview = Omit<RetentionExecutionReport, 'status' | 'scheduledFor' | 'completedAt'> & {
  limitedToBatch: boolean;
};

export type RetentionConfiguration = {
  configured: boolean;
  invalid: boolean;
  settings: RetentionSettings;
  lastReport: RetentionExecutionReport | null;
};

export const DEFAULT_RETENTION_SETTINGS: RetentionSettings = {
  schedule: {
    enabled: true,
    timezone: 'UTC',
    time: '02:00',
  },
  playedVoiceNotes: { enabled: true, ageDays: 7 },
  unplayedVoiceNotes: { enabled: false, ageDays: 7 },
  audioBroadcasts: { enabled: false, ageDays: 7 },
  unusedPdfUploads: { enabled: true, ageDays: 7 },
};

export class RetentionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetentionValidationError';
  }
}

function parseTime(value: unknown) {
  const time = typeof value === 'string' ? value.trim() : '';
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RetentionValidationError('Retention time must use HH:MM in 24-hour time.');

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new RetentionValidationError('Retention time must be a valid 24-hour time.');
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseTimezone(value: unknown) {
  const timezone = typeof value === 'string' ? value.trim() : '';
  if (!timezone || timezone.length > 100) {
    throw new RetentionValidationError('Retention timezone is required.');
  }

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new RetentionValidationError('Retention timezone must be a valid IANA timezone.');
  }
}

function parseCategory(value: unknown, label: string): RetentionCategory {
  if (!isRecord(value) || typeof value.enabled !== 'boolean') {
    throw new RetentionValidationError(`${label} retention must specify whether it is enabled.`);
  }
  const ageDays = Number(value.ageDays);
  if (!Number.isSafeInteger(ageDays) || ageDays < 1 || ageDays > MAX_RETENTION_AGE_DAYS) {
    throw new RetentionValidationError(`${label} retention age must be 1-${MAX_RETENTION_AGE_DAYS} days.`);
  }
  return { enabled: value.enabled, ageDays };
}

export function parseRetentionSettings(value: unknown): RetentionSettings {
  if (!isRecord(value) || !isRecord(value.schedule) || typeof value.schedule.enabled !== 'boolean') {
    throw new RetentionValidationError('Retention schedule is invalid.');
  }

  return {
    schedule: {
      enabled: value.schedule.enabled,
      timezone: parseTimezone(value.schedule.timezone),
      time: parseTime(value.schedule.time),
    },
    playedVoiceNotes: parseCategory(value.playedVoiceNotes, 'Played voice-note'),
    unplayedVoiceNotes: parseCategory(value.unplayedVoiceNotes, 'Unplayed voice-note'),
    audioBroadcasts: parseCategory(value.audioBroadcasts, 'Audio broadcast'),
    unusedPdfUploads: parseCategory(value.unusedPdfUploads, 'Unused PDF upload'),
  };
}

function zonedDateParts(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function getRetentionScheduleKey(settings: RetentionSettings, now = new Date()) {
  if (!settings.schedule.enabled) return null;

  const [hour, minute] = settings.schedule.time.split(':').map(Number);
  const zoned = zonedDateParts(settings.schedule.timezone, now);
  return zoned.hour > hour || (zoned.hour === hour && zoned.minute >= minute)
    ? zoned.date
    : null;
}
