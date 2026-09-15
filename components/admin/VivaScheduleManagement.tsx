'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarDays, Loader2, Pencil } from 'lucide-react';

import type { VivaPanelDto } from '../../lib/vivaPanelAdmin';
import type { VivaRoundDto, VivaTeamOption } from '../../lib/vivaRoundAdmin';
import type { VivaScheduleDto } from '../../lib/vivaScheduling';
import { Badge, Button, DashboardPanel, SectionHeader, StyledInput } from '../ui';

type VivaScheduleDraft = {
  projectId: string;
  panelId: string;
  scheduledAt: string;
  locationLabel: string;
};

const PAKISTAN_TIME_ZONE = 'Asia/Karachi';
const PAKISTAN_UTC_OFFSET = '+05:00';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === 'string' && value.error.trim()
    ? value.error
    : fallback;
}

function readSchedule(value: unknown): VivaScheduleDto | null {
  if (!isRecord(value)) return null;

  const version = typeof value.version === 'number' && Number.isSafeInteger(value.version) && value.version >= 0
    ? value.version
    : null;

  if (
    typeof value.id !== 'string'
    || typeof value.roundId !== 'string'
    || typeof value.panelId !== 'string'
    || typeof value.projectId !== 'string'
    || typeof value.scheduledAt !== 'string'
    || typeof value.vivaEndsAt !== 'string'
    || typeof value.locationLabel !== 'string'
    || version === null
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
    version,
  };
}

function scheduleInputValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAKISTAN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = new Map(parts.map(({ type, value }) => [type, value]));

  return `${values.get('year')}-${values.get('month')}-${values.get('day')}T${values.get('hour')}:${values.get('minute')}`;
}

function toPakistanUtc(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;

  const scheduledAt = new Date(`${value}:00${PAKISTAN_UTC_OFFSET}`);
  return Number.isFinite(scheduledAt.getTime()) ? scheduledAt.toISOString() : null;
}

function formatPakistanTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Invalid date';

  return new Intl.DateTimeFormat('en-PK', {
    timeZone: PAKISTAN_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function emptyDraft(): VivaScheduleDraft {
  return {
    projectId: '',
    panelId: '',
    scheduledAt: scheduleInputValue(new Date()),
    locationLabel: '',
  };
}

export default function VivaScheduleManagement({
  round,
  teams,
  examiners,
  panels,
  schedules,
  isRoundSaving,
  onSaved,
}: {
  round: VivaRoundDto;
  teams: VivaTeamOption[];
  examiners: Array<{ id: string; name: string }>;
  panels: VivaPanelDto[];
  schedules: VivaScheduleDto[];
  isRoundSaving: boolean;
  onSaved: (schedule: VivaScheduleDto) => void;
}) {
  const [draft, setDraft] = useState<VivaScheduleDraft>(emptyDraft);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const roundTeams = useMemo(
    () => teams.filter((team) => round.projectIds.includes(team.id)),
    [round.projectIds, teams]
  );
  const roundSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.roundId === round.id),
    [round.id, schedules]
  );
  const editingSchedule = roundSchedules.find((schedule) => schedule.id === editingScheduleId) || null;
  const scheduledTeamIds = new Set(roundSchedules.map((schedule) => schedule.projectId));
  const examinerNames = new Map(examiners.map((examiner) => [examiner.id, examiner.name]));
  const panelsById = new Map(panels.map((panel) => [panel.id, panel]));
  const teamsById = new Map(roundTeams.map((team) => [team.id, team]));
  const controlsDisabled = isRoundSaving || isSaving;

  const resetDraft = () => {
    setEditingScheduleId(null);
    setDraft(emptyDraft());
    setError('');
    setSavedMessage('');
  };

  const editSchedule = (schedule: VivaScheduleDto) => {
    setEditingScheduleId(schedule.id);
    setDraft({
      projectId: schedule.projectId,
      panelId: schedule.panelId,
      scheduledAt: scheduleInputValue(new Date(schedule.scheduledAt)),
      locationLabel: schedule.locationLabel,
    });
    setError('');
    setSavedMessage('');
  };

  const saveSchedule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (controlsDisabled) return;

    const scheduledAt = toPakistanUtc(draft.scheduledAt);
    if (!scheduledAt) {
      setError('Choose a valid Asia/Karachi date and time.');
      return;
    }

    setIsSaving(true);
    setError('');
    setSavedMessage('');

    try {
      const response = await fetch('/api/admin/viva', {
        method: editingSchedule ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingSchedule ? 'reschedule-session' : 'schedule-session',
          ...draft,
          scheduledAt,
          ...(editingSchedule ? { sessionId: editingSchedule.id, version: editingSchedule.version } : {}),
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to save the Viva schedule.'));
      const schedule = isRecord(body) ? readSchedule(body.schedule) : null;
      if (!schedule) throw new Error('Viva schedule response was invalid.');

      onSaved(schedule);
      setSavedMessage(editingSchedule ? 'Viva session rescheduled.' : 'Viva session scheduled.');
      setEditingScheduleId(null);
      setDraft(emptyDraft());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the Viva schedule.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <DashboardPanel>
      <SectionHeader
        title="Manual Team Scheduling"
        description="Reserve a panel and team interval. Times are shown and entered in Asia/Karachi."
        action={editingSchedule ? <Button variant="ghost" onClick={resetDraft} disabled={controlsDisabled}>New schedule</Button> : undefined}
      />
      {error && <p role="alert" className="mb-4 rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
      {savedMessage && <p role="status" className="mb-4 rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-success)]">{savedMessage}</p>}

      <form onSubmit={saveSchedule} aria-busy={isSaving} className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="viva-schedule-team" className="mb-2 block text-sm font-bold text-[var(--color-text)]">Team</label>
          <select id="viva-schedule-team" value={draft.projectId} required disabled={controlsDisabled} onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))} className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
            <option value="">Choose a team</option>
            {roundTeams.map((team) => (
              <option key={team.id} value={team.id} disabled={scheduledTeamIds.has(team.id) && team.id !== editingSchedule?.projectId}>{team.title}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="viva-schedule-panel" className="mb-2 block text-sm font-bold text-[var(--color-text)]">Panel</label>
          <select id="viva-schedule-panel" value={draft.panelId} required disabled={controlsDisabled} onChange={(event) => setDraft((current) => ({ ...current, panelId: event.target.value }))} className="min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]">
            <option value="">Choose a panel</option>
            {panels.map((panel, index) => {
              const valid = panel.examinerIds.length >= round.minimumPanelSize && panel.examinerIds.length <= round.targetPanelSize;
              const panelAdmin = examinerNames.get(panel.panelAdminId) || 'Unknown panel admin';
              return <option key={panel.id} value={panel.id} disabled={!valid}>Panel {index + 1}, {panel.examinerIds.length} teachers, admin: {panelAdmin}{valid ? '' : ' (not ready)'}</option>;
            })}
          </select>
        </div>
        <div>
          <label htmlFor="viva-schedule-time" className="mb-2 block text-sm font-bold text-[var(--color-text)]">Date and time (Asia/Karachi)</label>
          <StyledInput id="viva-schedule-time" type="datetime-local" value={draft.scheduledAt} required disabled={controlsDisabled} onChange={(event) => setDraft((current) => ({ ...current, scheduledAt: event.target.value }))} />
        </div>
        <div>
          <label htmlFor="viva-schedule-location" className="mb-2 block text-sm font-bold text-[var(--color-text)]">Location (optional)</label>
          <StyledInput id="viva-schedule-location" value={draft.locationLabel} maxLength={160} disabled={controlsDisabled} placeholder="For example, Lab 3" onChange={(event) => setDraft((current) => ({ ...current, locationLabel: event.target.value }))} />
        </div>
        <div className="lg:col-span-2 flex justify-end">
          <Button type="submit" disabled={controlsDisabled || roundTeams.length === 0 || panels.length === 0}>{isSaving ? <Loader2 className="animate-spin" size={16} /> : <CalendarDays size={16} />}{isSaving ? 'Saving...' : editingSchedule ? 'Reschedule Session' : 'Schedule Session'}</Button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        {roundSchedules.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">No team sessions are scheduled for this round.</p>
        ) : roundSchedules.map((schedule) => {
          const team = teamsById.get(schedule.projectId);
          const panel = panelsById.get(schedule.panelId);
          const panelAdmin = panel ? examinerNames.get(panel.panelAdminId) || 'Unknown panel admin' : 'Unavailable panel';
          return (
            <div key={schedule.id} className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-[var(--color-text)]">{team?.title || 'Unavailable team'}</p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{formatPakistanTime(schedule.scheduledAt)} to {formatPakistanTime(schedule.vivaEndsAt)}{schedule.locationLabel ? `, ${schedule.locationLabel}` : ''}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">Panel admin: {panelAdmin}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="muted">Version {schedule.version}</Badge>
                <Button variant="outline" onClick={() => editSchedule(schedule)} disabled={controlsDisabled}><Pencil size={16} />Edit</Button>
              </div>
            </div>
          );
        })}
      </div>
    </DashboardPanel>
  );
}
