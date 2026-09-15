'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Loader2, Plus, RotateCcw } from 'lucide-react';

import type {
  VivaExaminerOption,
  VivaRoundDto,
  VivaTeamOption,
} from '../../lib/vivaRoundAdmin';
import type { VivaPanelDto } from '../../lib/vivaPanelAdmin';
import type { VivaScheduleDto } from '../../lib/vivaScheduling';
import { Badge, Button, DashboardPanel, SectionHeader, StyledInput } from '../ui';
import VivaPanelManagement from './VivaPanelManagement';
import VivaScheduleManagement from './VivaScheduleManagement';

type VivaRoundDraft = {
  name: string;
  targetPanelSize: number;
  minimumPanelSize: number;
  vivaDurationMinutes: number;
  projectIds: string[];
  examinerIds: string[];
};

type VivaConfigurationResponse = {
  rounds: VivaRoundDto[];
  teams: VivaTeamOption[];
  examiners: VivaExaminerOption[];
  panels: VivaPanelDto[];
  schedules: VivaScheduleDto[];
};

const EMPTY_DRAFT: VivaRoundDraft = {
  name: '',
  targetPanelSize: 3,
  minimumPanelSize: 2,
  vivaDurationMinutes: 30,
  projectIds: [],
  examinerIds: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPanelRevision(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function readRound(value: unknown): VivaRoundDto | null {
  if (!isRecord(value)) return null;

  const projectIds = stringList(value.projectIds);
  const examinerIds = stringList(value.examinerIds);
  const targetPanelSize = readNumber(value.targetPanelSize);
  const minimumPanelSize = readNumber(value.minimumPanelSize);
  const vivaDurationMinutes = readNumber(value.vivaDurationMinutes);
  const panelRevision = readPanelRevision(value.panelRevision);

  if (
    typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || panelRevision === null
    || !projectIds
    || !examinerIds
    || targetPanelSize === null
    || minimumPanelSize === null
    || vivaDurationMinutes === null
    || (value.frozenAt !== null && typeof value.frozenAt !== 'string')
    || (value.createdAt !== null && typeof value.createdAt !== 'string')
    || (value.updatedAt !== null && typeof value.updatedAt !== 'string')
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    targetPanelSize,
    minimumPanelSize,
    vivaDurationMinutes,
    projectIds,
    examinerIds,
    panelRevision,
    frozenAt: value.frozenAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function readTeam(value: unknown): VivaTeamOption | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || !Array.isArray(value.members)) {
    return null;
  }

  const members = value.members.flatMap((member) => {
    if (
      !isRecord(member)
      || typeof member.id !== 'string'
      || typeof member.name !== 'string'
      || typeof member.rollNo !== 'string'
    ) {
      return [];
    }
    return [{ id: member.id, name: member.name, rollNo: member.rollNo }];
  });

  return members.length === value.members.length
    ? { id: value.id, title: value.title, members }
    : null;
}

function readExaminer(value: unknown): VivaExaminerOption | null {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.rollNo === 'string'
    ? { id: value.id, name: value.name, rollNo: value.rollNo }
    : null;
}

function readPanel(value: unknown): VivaPanelDto | null {
  if (!isRecord(value) || !Array.isArray(value.examinerIds)) return null;

  if (
    typeof value.id !== 'string'
    || typeof value.roundId !== 'string'
    || typeof value.panelAdminId !== 'string'
    || !value.examinerIds.every((examinerId) => typeof examinerId === 'string')
  ) {
    return null;
  }

  return {
    id: value.id,
    roundId: value.roundId,
    examinerIds: value.examinerIds,
    panelAdminId: value.panelAdminId,
  };
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

function readList<T>(value: unknown, readItem: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;

  const items: T[] = [];
  for (const item of value) {
    const parsed = readItem(item);
    if (!parsed) return null;
    items.push(parsed);
  }
  return items;
}

function readConfiguration(value: unknown): VivaConfigurationResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const rounds = readList(value.rounds, readRound);
  const teams = readList(value.teams, readTeam);
  const examiners = readList(value.examiners, readExaminer);
  const panels = readList(value.panels, readPanel);
  const schedules = readList(value.schedules, readSchedule);
  return rounds && teams && examiners && panels && schedules ? { rounds, teams, examiners, panels, schedules } : null;
}

function readError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === 'string' && value.error.trim()
    ? value.error
    : fallback;
}

function toDraft(round: VivaRoundDto): VivaRoundDraft {
  return {
    name: round.name,
    targetPanelSize: round.targetPanelSize,
    minimumPanelSize: round.minimumPanelSize,
    vivaDurationMinutes: round.vivaDurationMinutes,
    projectIds: round.projectIds,
    examinerIds: round.examinerIds,
  };
}

function toggleSelection(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((selectedId) => selectedId !== id) : [...ids, id];
}

export default function AdminVivaSection() {
  const [rounds, setRounds] = useState<VivaRoundDto[]>([]);
  const [teams, setTeams] = useState<VivaTeamOption[]>([]);
  const [examiners, setExaminers] = useState<VivaExaminerOption[]>([]);
  const [panels, setPanels] = useState<VivaPanelDto[]>([]);
  const [schedules, setSchedules] = useState<VivaScheduleDto[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VivaRoundDraft>(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');

  const selectedRound = useMemo(
    () => rounds.find((round) => round.id === selectedRoundId) || null,
    [rounds, selectedRoundId]
  );
  const isFrozen = Boolean(selectedRound?.frozenAt);

  const loadConfiguration = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/viva', { cache: 'no-store' });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to load Viva configuration.'));

      const data = readConfiguration(body);
      if (!data) throw new Error('Viva configuration response was invalid.');

      setRounds(data.rounds);
      setTeams(data.teams);
      setExaminers(data.examiners);
      setPanels(data.panels);
      setSchedules(data.schedules);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load Viva configuration.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConfiguration();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadConfiguration]);

  const startNewRound = () => {
    setSelectedRoundId(null);
    setDraft(EMPTY_DRAFT);
    setError('');
    setSavedMessage('');
  };

  const openRound = (round: VivaRoundDto) => {
    setSelectedRoundId(round.id);
    setDraft(toDraft(round));
    setError('');
    setSavedMessage('');
  };

  const saveRound = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isFrozen || isSaving) return;

    setIsSaving(true);
    setError('');
    setSavedMessage('');

    try {
      const response = await fetch('/api/admin/viva', {
        method: selectedRoundId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, ...(selectedRoundId ? { roundId: selectedRoundId } : {}) }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to save the Viva round.'));
      if (!isRecord(body)) throw new Error('Viva round response was invalid.');

      const savedRound = readRound(body.round);
      if (!savedRound) throw new Error('Viva round response was invalid.');

      setRounds((current) => {
        return selectedRoundId
          ? current.map((round) => round.id === savedRound.id ? savedRound : round)
          : [savedRound, ...current];
      });
      setSelectedRoundId(savedRound.id);
      setDraft(toDraft(savedRound));
      setSavedMessage(selectedRoundId ? 'Viva round updated.' : 'Viva round created.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the Viva round.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
        Loading Viva configuration...
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <DashboardPanel className="h-fit xl:sticky xl:top-0">
        <SectionHeader
          title="Viva Rounds"
          description="Create a round, then return here to change it until its first session starts."
          action={
            <Button variant="outline" onClick={startNewRound} disabled={isSaving}>
              <Plus size={16} />New Round
            </Button>
          }
        />
        {rounds.length === 0 ? (
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">No Viva rounds have been created.</p>
        ) : (
          <div className="space-y-2">
            {rounds.map((round) => (
              <button
                key={round.id}
                type="button"
                onClick={() => openRound(round)}
                className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] ${
                  selectedRoundId === round.id
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
                }`}
              >
                <span className="block truncate text-sm font-bold text-[var(--color-text)]">{round.name}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  <Badge variant={round.frozenAt ? 'warning' : 'success'}>
                    {round.frozenAt ? 'Started' : 'Unstarted'}
                  </Badge>
                  <Badge variant="muted">{round.projectIds.length} teams</Badge>
                </span>
              </button>
            ))}
          </div>
        )}
      </DashboardPanel>

      <div className="space-y-6">
      <form onSubmit={saveRound} className="space-y-6" aria-busy={isSaving}>
        <DashboardPanel>
          <SectionHeader
            title={selectedRound ? `Configure ${selectedRound.name}` : 'New Viva Round'}
            description={
              isFrozen
                ? 'This round has started, so its setup is now locked.'
                : 'Choose the teams and active teachers who will take part in this round.'
            }
            action={
              selectedRound ? (
                <Button variant="ghost" onClick={startNewRound} disabled={isSaving}>
                  <RotateCcw size={16} />Start New
                </Button>
              ) : undefined
            }
          />

          {error && <p role="alert" className="mb-4 rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
          {savedMessage && <p role="status" className="mb-4 rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-success)]">{savedMessage}</p>}

          <fieldset disabled={isFrozen || isSaving} className="space-y-6 disabled:opacity-65">
            <div>
              <label htmlFor="viva-round-name" className="mb-2 block text-sm font-bold text-[var(--color-text)]">Round name</label>
              <StyledInput id="viva-round-name" value={draft.name} maxLength={120} required placeholder="For example, Fall 2026 Viva" onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {([
                ['targetPanelSize', 'Target panel size', 2],
                ['minimumPanelSize', 'Minimum panel size', 2],
                ['vivaDurationMinutes', 'Viva minutes', 1],
              ] as const).map(([field, label, minimum]) => (
                <div key={field}>
                  <label htmlFor={`viva-${field}`} className="mb-2 block text-sm font-bold text-[var(--color-text)]">{label}</label>
                  <StyledInput id={`viva-${field}`} type="number" min={minimum} step={1} required value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: Number(event.target.value) }))} />
                </div>
              ))}
            </div>
          </fieldset>
        </DashboardPanel>

        <div className="grid gap-6 xl:grid-cols-2">
          <SelectionPanel
            title="Participating Teams"
            description="Choose the project teams included in this Viva round."
            items={teams}
            selectedIds={draft.projectIds}
            disabled={isFrozen || isSaving}
            onToggle={(id) => setDraft((current) => ({ ...current, projectIds: toggleSelection(current.projectIds, id) }))}
            onSelectAll={() => setDraft((current) => ({ ...current, projectIds: teams.map((team) => team.id) }))}
            onClear={() => setDraft((current) => ({ ...current, projectIds: [] }))}
            renderItem={(team) => (
              <>
                <span className="block font-bold text-[var(--color-text)]">{team.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[var(--color-text-muted)]">{team.members.map((member) => `${member.name}${member.rollNo ? ` (${member.rollNo})` : ''}`).join(', ')}</span>
              </>
            )}
          />
          <SelectionPanel
            title="Active Teachers"
            description="Choose the supervisors available to examine teams in this round."
            items={examiners}
            selectedIds={draft.examinerIds}
            disabled={isFrozen || isSaving}
            onToggle={(id) => setDraft((current) => ({ ...current, examinerIds: toggleSelection(current.examinerIds, id) }))}
            onSelectAll={() => setDraft((current) => ({ ...current, examinerIds: examiners.map((examiner) => examiner.id) }))}
            onClear={() => setDraft((current) => ({ ...current, examinerIds: [] }))}
            renderItem={(examiner) => (
              <>
                <span className="block font-bold text-[var(--color-text)]">{examiner.name}</span>
                {examiner.rollNo && <span className="mt-1 block text-xs text-[var(--color-text-muted)]">{examiner.rollNo}</span>}
              </>
            )}
          />
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={isSaving} onClick={() => void loadConfiguration()}>Reload</Button>
          {!isFrozen && <Button type="submit" disabled={isSaving}>{isSaving ? <Loader2 className="animate-spin" size={16} /> : null}{isSaving ? 'Saving...' : selectedRound ? 'Save Changes' : 'Create Viva Round'}</Button>}
        </div>
      </form>

      {selectedRound && (
        <VivaPanelManagement
          key={`${selectedRound.id}:${selectedRound.panelRevision}`}
          round={selectedRound}
          examiners={examiners}
          panels={panels.filter((panel) => panel.roundId === selectedRound.id)}
          isRoundSaving={isSaving}
          onSaved={(savedPanels, panelRevision) => {
            setPanels((current) => [
              ...current.filter((panel) => panel.roundId !== selectedRound.id),
              ...savedPanels,
            ]);
            setRounds((current) => current.map((round) => (
              round.id === selectedRound.id ? { ...round, panelRevision } : round
            )));
          }}
          onReload={loadConfiguration}
        />
      )}
      {selectedRound && (
        <VivaScheduleManagement
          key={selectedRound.id}
          round={selectedRound}
          teams={teams}
          examiners={examiners}
          panels={panels.filter((panel) => panel.roundId === selectedRound.id)}
          schedules={schedules}
          isRoundSaving={isSaving}
          onSaved={(savedSchedule) => setSchedules((current) => [
            ...current.filter((schedule) => schedule.id !== savedSchedule.id),
            savedSchedule,
          ].sort((first, second) => first.scheduledAt.localeCompare(second.scheduledAt)))}
        />
      )}
      </div>
    </div>
  );
}

function SelectionPanel<T extends { id: string }>({
  title,
  description,
  items,
  selectedIds,
  disabled,
  onToggle,
  onSelectAll,
  onClear,
  renderItem,
}: {
  title: string;
  description: string;
  items: T[];
  selectedIds: string[];
  disabled: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <DashboardPanel>
      <SectionHeader
        title={title}
        description={`${description} ${selectedIds.length} selected.`}
        action={
          <span className="flex gap-2">
            <Button variant="ghost" disabled={disabled || items.length === 0} onClick={onSelectAll}>All</Button>
            <Button variant="ghost" disabled={disabled || selectedIds.length === 0} onClick={onClear}>Clear</Button>
          </span>
        }
      />
      {items.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">No eligible {title.toLowerCase()} are available.</p>
      ) : (
        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => {
            const inputId = `${title.toLowerCase().replaceAll(' ', '-')}-${item.id}`;
            return (
              <label key={item.id} htmlFor={inputId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-colors hover:bg-[var(--color-surface-muted)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-accent)]">
                <input id={inputId} type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={selectedIds.includes(item.id)} disabled={disabled} onChange={() => onToggle(item.id)} />
                <span className="min-w-0 flex-1">{renderItem(item)}</span>
              </label>
            );
          })}
        </div>
      )}
    </DashboardPanel>
  );
}
