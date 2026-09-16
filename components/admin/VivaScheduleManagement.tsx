'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarCheck2, CalendarDays, Loader2, XCircle } from 'lucide-react';

import type { VivaPanelDto } from '../../lib/vivaPanelAdmin';
import type { VivaRoundDto, VivaTeamOption } from '../../lib/vivaRoundAdmin';
import type { VivaAutomaticSchedulePreview, VivaScheduleDto } from '../../lib/vivaScheduling';
import { Badge, Button, DashboardPanel, SectionHeader, StyledInput, TextArea } from '../ui';

type AvailabilityDraft = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  rooms: string;
};

type BusyAction = 'preview' | 'apply' | 'confirm' | 'cancel' | null;

type VivaScheduleManagementProps = {
  round: VivaRoundDto;
  teams: VivaTeamOption[];
  panels: VivaPanelDto[];
  schedules: VivaScheduleDto[];
  isRoundSaving: boolean;
  onSaved: (schedule: VivaScheduleDto) => void;
  onConfirmed: (round: VivaRoundDto) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === 'string' && value.error.trim()
    ? value.error
    : fallback;
}

function readSchedule(value: unknown): VivaScheduleDto | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string'
    || typeof value.roundId !== 'string'
    || typeof value.panelId !== 'string'
    || typeof value.projectId !== 'string'
    || typeof value.scheduledAt !== 'string'
    || typeof value.vivaEndsAt !== 'string'
    || typeof value.locationLabel !== 'string'
    || typeof value.cancellationReason !== 'string'
    || typeof value.version !== 'number'
    || (value.phase !== 'scheduled' && value.phase !== 'running' && value.phase !== 'completed' && value.phase !== 'cancelled')
  ) {
    return null;
  }

  return {
    id: value.id,
    roundId: value.roundId,
    panelId: value.panelId,
    projectId: value.projectId,
    scheduledAt: value.scheduledAt,
    vivaEndsAt: value.vivaEndsAt,
    locationLabel: value.locationLabel,
    cancellationReason: value.cancellationReason,
    version: value.version,
    phase: value.phase,
  };
}

function readPreview(value: unknown): VivaAutomaticSchedulePreview | null {
  if (!isRecord(value) || !Array.isArray(value.scheduled) || !Array.isArray(value.unplaced)) return null;

  const scheduled = value.scheduled.filter((entry): entry is VivaAutomaticSchedulePreview['scheduled'][number] => (
    isRecord(entry)
    && typeof entry.projectId === 'string'
    && typeof entry.panelId === 'string'
    && typeof entry.scheduledAt === 'string'
    && typeof entry.vivaEndsAt === 'string'
    && typeof entry.locationLabel === 'string'
  ));
  const unplaced = value.unplaced.filter((entry): entry is VivaAutomaticSchedulePreview['unplaced'][number] => (
    isRecord(entry)
    && typeof entry.projectId === 'string'
    && typeof entry.reason === 'string'
  ));

  return scheduled.length === value.scheduled.length && unplaced.length === value.unplaced.length
    ? { scheduled, unplaced }
    : null;
}

function dateInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function timeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isFinite(value.getTime()) ? value : null;
}

function initialAvailability(): AvailabilityDraft {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60_000);
  return {
    startDate: dateInputValue(startsAt),
    startTime: timeInputValue(startsAt),
    endDate: dateInputValue(endsAt),
    endTime: timeInputValue(endsAt),
    rooms: '',
  };
}

function formatLocalTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'Invalid time';
}

function roomList(value: string): string[] {
  const rooms = value.split('\n').map((room) => room.trim()).filter(Boolean);
  return [...new Map(rooms.map((room) => [room.toLocaleLowerCase(), room])).values()];
}

function AvailabilityDateTimeField({
  label,
  dateId,
  timeId,
  date,
  time,
  disabled,
  onDateChange,
  onTimeChange,
}: {
  label: string;
  dateId: string;
  timeId: string;
  date: string;
  time: string;
  disabled: boolean;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
}) {
  return (
    <fieldset className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
      <legend className="px-1 text-sm font-bold text-[var(--color-text)]">{label}</legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
        <div>
          <label htmlFor={dateId} className="mb-1.5 block text-xs font-semibold text-[var(--color-text-muted)]">Date</label>
          <StyledInput id={dateId} type="date" required value={date} disabled={disabled} onChange={(event) => onDateChange(event.target.value)} />
        </div>
        <div>
          <label htmlFor={timeId} className="mb-1.5 block text-xs font-semibold text-[var(--color-text-muted)]">Time</label>
          <StyledInput id={timeId} type="time" required value={time} disabled={disabled} onChange={(event) => onTimeChange(event.target.value)} />
        </div>
      </div>
    </fieldset>
  );
}

export default function VivaScheduleManagement({
  round,
  teams,
  panels,
  schedules,
  isRoundSaving,
  onSaved,
  onConfirmed,
}: VivaScheduleManagementProps) {
  const [availability, setAvailability] = useState<AvailabilityDraft>(initialAvailability);
  const [draft, setDraft] = useState<VivaAutomaticSchedulePreview | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<BusyAction>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');

  const roundTeams = useMemo(
    () => teams.filter((team) => round.projectIds.includes(team.id)),
    [round.projectIds, teams]
  );
  const teamsById = useMemo(
    () => new Map(roundTeams.map((team) => [team.id, team])),
    [roundTeams]
  );
  const roundSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.roundId === round.id),
    [round.id, schedules]
  );
  const disabled = Boolean(round.confirmedAt) || isRoundSaving || busy !== null;

  const updateAvailability = (field: Exclude<keyof AvailabilityDraft, 'rooms'>, value: string) => {
    setAvailability((current) => ({ ...current, [field]: value }));
  };

  const preview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const startsAt = localDateTime(availability.startDate, availability.startTime);
    const endsAt = localDateTime(availability.endDate, availability.endTime);
    const rooms = roomList(availability.rooms);
    if (!startsAt || !endsAt || startsAt >= endsAt || rooms.length === 0 || rooms.length > 32) {
      setError('Choose a valid local time window and between 1 and 32 rooms.');
      return;
    }

    setBusy('preview');
    setError('');
    try {
      const response = await fetch('/api/admin/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview-automatic-schedule',
          roundId: round.id,
          availability: rooms.map((locationLabel) => ({
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            locationLabel,
          })),
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to generate the Viva schedule draft.'));

      const nextDraft = isRecord(body) ? readPreview(body.draft) : null;
      if (!nextDraft) throw new Error('Viva automatic schedule response was invalid.');
      setDraft(nextDraft);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate the Viva schedule draft.');
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!draft?.scheduled.length) return;

    setBusy('apply');
    setError('');
    try {
      const response = await fetch('/api/admin/viva', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply-automatic-schedule',
          roundId: round.id,
          schedules: draft.scheduled.map(({ projectId, panelId, scheduledAt, locationLabel }) => ({
            projectId,
            panelId,
            scheduledAt,
            locationLabel,
          })),
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to save the Viva schedule draft.'));

      const saved = isRecord(body) && Array.isArray(body.schedules)
        ? body.schedules.map(readSchedule)
        : null;
      if (!saved?.every((schedule): schedule is VivaScheduleDto => Boolean(schedule))) {
        throw new Error('Viva automatic schedule response was invalid.');
      }

      saved.forEach(onSaved);
      setDraft(null);
      setMessage(`${saved.length} Viva sessions scheduled.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save Viva schedule draft.');
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    setBusy('confirm');
    setError('');
    try {
      const response = await fetch('/api/admin/viva', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm-round', roundId: round.id }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to confirm this Viva round.'));
      if (!isRecord(body) || !isRecord(body.round)) throw new Error('Viva confirmation response was invalid.');

      onConfirmed(body.round as VivaRoundDto);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to confirm this Viva round.');
    } finally {
      setBusy(null);
    }
  };

  const cancel = async (schedule: VivaScheduleDto) => {
    if (!cancellationReason.trim()) return;

    setBusy('cancel');
    setError('');
    try {
      const response = await fetch('/api/admin/viva', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel-session',
          sessionId: schedule.id,
          version: schedule.version,
          cancellationReason,
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to cancel the Viva session.'));

      const cancelled = isRecord(body) ? readSchedule(body.schedule) : null;
      if (!cancelled) throw new Error('Viva cancellation response was invalid.');

      onSaved(cancelled);
      setCancellingId(null);
      setCancellationReason('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to cancel the Viva session.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <DashboardPanel>
        <SectionHeader
          title="Automatic Team Scheduling"
          description={round.confirmedAt
            ? 'This round is confirmed. Sessions are visible to students and scheduling is locked.'
            : 'Choose a local availability window and rooms for concurrent sessions.'}
        />

        {error && <p role="alert" className="mb-4 rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
        {message && <p role="status" className="mb-4 rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-success)]">{message}</p>}

        {!round.confirmedAt && (
          <form onSubmit={preview} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(14rem,0.8fr)]">
            <AvailabilityDateTimeField
              label="Available from (your local time)"
              dateId="viva-availability-start-date"
              timeId="viva-availability-start-time"
              date={availability.startDate}
              time={availability.startTime}
              disabled={disabled}
              onDateChange={(value) => updateAvailability('startDate', value)}
              onTimeChange={(value) => updateAvailability('startTime', value)}
            />
            <AvailabilityDateTimeField
              label="Available until (your local time)"
              dateId="viva-availability-end-date"
              timeId="viva-availability-end-time"
              date={availability.endDate}
              time={availability.endTime}
              disabled={disabled}
              onDateChange={(value) => updateAvailability('endDate', value)}
              onTimeChange={(value) => updateAvailability('endTime', value)}
            />
            <div>
              <label htmlFor="viva-availability-rooms" className="mb-2 block text-sm font-bold text-[var(--color-text)]">Rooms, one per line</label>
              <TextArea id="viva-availability-rooms" required value={availability.rooms} placeholder={'Lab 3\nLab 4'} disabled={disabled} onChange={(event) => setAvailability((current) => ({ ...current, rooms: event.target.value }))} />
            </div>
            <div className="xl:col-span-3 flex justify-end">
              <Button type="submit" disabled={disabled || roundTeams.length === 0 || panels.length === 0}>
                {busy === 'preview' ? <Loader2 className="animate-spin" size={16} /> : <CalendarDays size={16} />}
                {busy === 'preview' ? 'Generating...' : 'Generate automatic draft'}
              </Button>
            </div>
          </form>
        )}

        {draft && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-[var(--color-text-muted)]">{draft.scheduled.length} sessions are ready to save unchanged.</p>
            <div className="max-h-[38rem] overflow-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--color-surface-muted)]">
                  <tr>
                    <th className="px-4 py-3">Team</th>
                    <th className="whitespace-nowrap px-4 py-3">Date & Time</th>
                    <th className="whitespace-nowrap px-4 py-3">Room</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.scheduled.map((session) => (
                    <tr key={session.projectId} className="border-t border-[var(--color-border)]">
                      <td className="px-4 py-3 font-semibold">
                        {teamsById.get(session.projectId)?.title || 'Unavailable team'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {formatLocalTime(session.scheduledAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {session.locationLabel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {draft.unplaced.length > 0 && (
              <div className="rounded-xl border border-[var(--color-border)] p-4">
                <p className="font-bold">Will be held if this round is confirmed</p>
                {draft.unplaced.map((entry) => (
                  <p key={entry.projectId} className="text-sm text-[var(--color-text-muted)]">
                    {teamsById.get(entry.projectId)?.title || 'Unavailable team'}: {entry.reason}
                  </p>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button onClick={() => void apply()} disabled={disabled || draft.scheduled.length === 0}>
                {busy === 'apply' ? <Loader2 className="animate-spin" size={16} /> : <CalendarDays size={16} />}
                {busy === 'apply' ? 'Saving...' : 'Save automatic sessions'}
              </Button>
            </div>
          </div>
        )}

        {!round.confirmedAt && (
          <div className="mt-6 flex justify-end">
            <Button variant="success" onClick={() => void confirm()} disabled={disabled}>
              {busy === 'confirm' ? <Loader2 className="animate-spin" size={16} /> : <CalendarCheck2 size={16} />}
              {busy === 'confirm' ? 'Confirming...' : 'Confirm round'}
            </Button>
          </div>
        )}

        {round.confirmedAt && (
          <div className="mt-5 rounded-xl border border-[var(--color-border)] p-4">
            <p className="font-bold">Held for a later round</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {round.heldProjectIds.length ? round.heldProjectIds.map((id) => teamsById.get(id)?.title || id).join(', ') : 'No teams are on hold.'}
            </p>
          </div>
        )}
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Scheduled sessions" description="Only cancellation remains available after confirmation." />
        {roundSchedules.map((schedule) => (
          <div key={schedule.id} className="mb-3 rounded-xl border border-[var(--color-border)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                <strong>{teamsById.get(schedule.projectId)?.title || 'Unavailable team'}</strong>
                <span className="block text-sm text-[var(--color-text-muted)]">
                  {formatLocalTime(schedule.scheduledAt)} to {formatLocalTime(schedule.vivaEndsAt)}, {schedule.locationLabel}
                </span>
              </p>
              <Badge variant={schedule.phase === 'cancelled' ? 'warning' : 'success'}>{schedule.phase}</Badge>
              {schedule.phase === 'scheduled' && (
                <Button variant="danger" onClick={() => setCancellingId(schedule.id)} disabled={busy !== null}>
                  <XCircle size={16} />Cancel
                </Button>
              )}
            </div>
            {cancellingId === schedule.id && (
              <div className="mt-3">
                <TextArea value={cancellationReason} maxLength={1000} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Cancellation reason" />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setCancellingId(null)}>Keep session</Button>
                  <Button variant="danger" onClick={() => void cancel(schedule)} disabled={busy !== null || !cancellationReason.trim()}>Confirm cancellation</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </DashboardPanel>
    </div>
  );
}
