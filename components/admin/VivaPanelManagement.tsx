'use client';

import { useMemo, useState } from 'react';
import { Loader2, Plus, Shuffle, Trash2 } from 'lucide-react';

import type { VivaPanelDto } from '../../lib/vivaPanelAdmin';
import type { VivaExaminerOption, VivaRoundDto } from '../../lib/vivaRoundAdmin';
import { Badge, Button, DashboardPanel, SectionHeader, Select, StyledInput } from '../ui';

type VivaPanelDraft = {
  id: string;
  examinerIds: string[];
  panelAdminId: string;
};

type VivaPanelManagementProps = {
  round: VivaRoundDto;
  examiners: VivaExaminerOption[];
  panels: VivaPanelDto[];
  isRoundSaving: boolean;
  onSaved: (panels: VivaPanelDto[], panelRevision: number) => void;
  onReload: () => Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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

function readPanelDraft(value: unknown): Omit<VivaPanelDraft, 'id'> | null {
  if (!isRecord(value) || !Array.isArray(value.examinerIds)) return null;
  if (
    typeof value.panelAdminId !== 'string'
    || !value.examinerIds.every((examinerId) => typeof examinerId === 'string')
  ) {
    return null;
  }

  return { examinerIds: value.examinerIds, panelAdminId: value.panelAdminId };
}

function readSaveResponse(value: unknown): { panels: VivaPanelDto[]; panelRevision: number } | null {
  if (!isRecord(value) || !Array.isArray(value.panels)) return null;

  const panels = value.panels.map(readPanel);
  if (panels.some((panel) => !panel)) return null;
  if (
    typeof value.panelRevision !== 'number'
    || !Number.isSafeInteger(value.panelRevision)
    || value.panelRevision < 0
  ) {
    return null;
  }

  return {
    panels: panels.filter((panel): panel is VivaPanelDto => Boolean(panel)),
    panelRevision: value.panelRevision,
  };
}

function readAllocationResponse(value: unknown): { panels: Array<Omit<VivaPanelDraft, 'id'>>; panelRevision: number } | null {
  if (!isRecord(value) || !Array.isArray(value.panels)) return null;

  const panels = value.panels.map(readPanelDraft);
  if (panels.some((panel) => !panel)) return null;
  if (
    typeof value.panelRevision !== 'number'
    || !Number.isSafeInteger(value.panelRevision)
    || value.panelRevision < 0
  ) {
    return null;
  }

  return {
    panels: panels.filter((panel): panel is Omit<VivaPanelDraft, 'id'> => Boolean(panel)),
    panelRevision: value.panelRevision,
  };
}

function readError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === 'string' && value.error.trim()
    ? value.error
    : fallback;
}

function initialDrafts(panels: VivaPanelDto[]): VivaPanelDraft[] {
  return panels.map((panel) => ({
    id: panel.id,
    examinerIds: panel.examinerIds,
    panelAdminId: panel.panelAdminId,
  }));
}

export default function VivaPanelManagement({
  round,
  examiners,
  panels,
  isRoundSaving,
  onSaved,
  onReload,
}: VivaPanelManagementProps) {
  const [draftPanels, setDraftPanels] = useState(() => initialDrafts(panels));
  const [search, setSearch] = useState('');
  const [nextDraftId, setNextDraftId] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const isFrozen = Boolean(round.frozenAt);
  const controlsDisabled = isFrozen || isSaving || isGenerating || isRoundSaving;

  const examinerById = useMemo(
    () => new Map(examiners.map((examiner) => [examiner.id, examiner])),
    [examiners]
  );
  const panelChoices = useMemo(
    () => draftPanels.map((panel, index) => ({ panel, number: index + 1 })),
    [draftPanels]
  );
  const selectedExaminerIds = useMemo(() => new Set(round.examinerIds), [round.examinerIds]);
  const assignedExaminerIds = useMemo(
    () => new Set(draftPanels.flatMap((panel) => panel.examinerIds)),
    [draftPanels]
  );
  const unassignedExaminers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return examiners.filter((examiner) => {
      if (!selectedExaminerIds.has(examiner.id) || assignedExaminerIds.has(examiner.id)) return false;
      return !normalizedSearch
        || `${examiner.name} ${examiner.rollNo}`.toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [assignedExaminerIds, examiners, search, selectedExaminerIds]);

  const addPanel = () => {
    setDraftPanels((current) => [
      ...current,
      { id: `new-${nextDraftId}`, examinerIds: [], panelAdminId: '' },
    ]);
    setNextDraftId((current) => current + 1);
    setError('');
    setSavedMessage('');
  };

  const addExaminer = (panelId: string, examinerId: string) => {
    if (!examinerId) return;

    setDraftPanels((current) => current.map((panel) => {
      if (panel.id !== panelId || panel.examinerIds.includes(examinerId)) return panel;
      return {
        ...panel,
        examinerIds: [...panel.examinerIds, examinerId],
        panelAdminId: panel.panelAdminId || examinerId,
      };
    }));
    setError('');
    setSavedMessage('');
  };

  const removeExaminer = (panelId: string, examinerId: string) => {
    if (draftPanels.find((panel) => panel.id === panelId)?.panelAdminId === examinerId) {
      setError('Choose a replacement panel admin before removing the current panel admin.');
      return;
    }

    setDraftPanels((current) => current.map((panel) => {
      if (panel.id !== panelId) return panel;

      return { ...panel, examinerIds: panel.examinerIds.filter((id) => id !== examinerId) };
    }));
    setError('');
    setSavedMessage('');
  };

  const moveExaminer = (sourcePanelId: string, examinerId: string, targetPanelId: string) => {
    if (!targetPanelId) return;
    if (draftPanels.find((panel) => panel.id === sourcePanelId)?.panelAdminId === examinerId) {
      setError('Choose a replacement panel admin before moving the current panel admin.');
      return;
    }

    setDraftPanels((current) => current.map((panel) => {
      if (panel.id === sourcePanelId) {
        return { ...panel, examinerIds: panel.examinerIds.filter((id) => id !== examinerId) };
      }
      if (panel.id === targetPanelId) {
        return {
          ...panel,
          examinerIds: [...panel.examinerIds, examinerId],
          panelAdminId: panel.panelAdminId || examinerId,
        };
      }
      return panel;
    }));
    setError('');
    setSavedMessage('');
  };

  const swapExaminer = (sourcePanelId: string, examinerId: string, replacementExaminerId: string) => {
    const sourcePanel = draftPanels.find((panel) => panel.id === sourcePanelId);
    const replacementPanel = draftPanels.find((panel) => panel.examinerIds.includes(replacementExaminerId));
    if (!sourcePanel || !replacementPanel || sourcePanel.id === replacementPanel.id) return;
    if (sourcePanel.panelAdminId === examinerId || replacementPanel.panelAdminId === replacementExaminerId) {
      setError('Choose replacement panel admins before swapping either current panel admin.');
      return;
    }

    setDraftPanels((current) => current.map((panel) => {
      if (panel.id === sourcePanelId) {
        return {
          ...panel,
          examinerIds: panel.examinerIds.map((candidate) => (
            candidate === examinerId ? replacementExaminerId : candidate
          )),
        };
      }
      if (panel.id === replacementPanel.id) {
        return {
          ...panel,
          examinerIds: panel.examinerIds.map((candidate) => (
            candidate === replacementExaminerId ? examinerId : candidate
          )),
        };
      }
      return panel;
    }));
    setError('');
    setSavedMessage('');
  };

  const discardPanel = (panelId: string) => {
    setDraftPanels((current) => current.filter((panel) => panel.id !== panelId));
    setError('');
    setSavedMessage('');
  };

  const savePanels = async () => {
    if (controlsDisabled) return;

    setIsSaving(true);
    setError('');
    setSavedMessage('');

    try {
      const response = await fetch('/api/admin/viva', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: round.id,
          panelRevision: round.panelRevision,
          panels: draftPanels
            .filter((panel) => panel.examinerIds.length > 0)
            .map(({ examinerIds, panelAdminId }) => ({ examinerIds, panelAdminId })),
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to save Viva panels.'));

      const saved = readSaveResponse(body);
      if (!saved) throw new Error('Viva panel response was invalid.');

      setDraftPanels(initialDrafts(saved.panels));
      onSaved(saved.panels, saved.panelRevision);
      setSavedMessage('Viva panels saved.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save Viva panels.');
    } finally {
      setIsSaving(false);
    }
  };

  const generateRandomPanels = async () => {
    if (controlsDisabled) return;

    setIsGenerating(true);
    setError('');
    setSavedMessage('');

    try {
      const response = await fetch('/api/admin/viva', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-panels',
          roundId: round.id,
          panelRevision: round.panelRevision,
        }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(readError(body, 'Unable to generate Viva panels.'));

      const allocation = readAllocationResponse(body);
      if (!allocation) throw new Error('Viva panel allocation response was invalid.');

      setDraftPanels(allocation.panels.map((panel, index) => ({
        id: `draft-${nextDraftId + index}`,
        ...panel,
      })));
      setNextDraftId((current) => current + allocation.panels.length);
      setSavedMessage('Random panel draft generated. Review it, then save when ready.');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate Viva panels.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <DashboardPanel className="p-4 sm:p-5" aria-busy={isSaving}>
      <SectionHeader
        title="Panel Management"
        description={
          isFrozen
            ? 'This round has started, so panel membership is locked.'
            : 'Assign each selected teacher once. Every saved panel has one panel admin.'
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void generateRandomPanels()} disabled={controlsDisabled}>
              {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Shuffle size={16} />}
              {isGenerating ? 'Generating...' : 'Generate Random Draft'}
            </Button>
            <Button variant="outline" onClick={addPanel} disabled={controlsDisabled}>
              <Plus size={16} />Add Panel
            </Button>
          </div>
        }
      />

      {error && <p role="alert" className="mb-4 rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
      {savedMessage && <p role="status" className="mb-4 rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-success)]">{savedMessage}</p>}

      <div className="grid gap-5 2xl:grid-cols-[15rem_minmax(0,1fr)]">
        <section className="h-fit 2xl:sticky 2xl:top-4" aria-labelledby="viva-unassigned-teachers">
          <h3 id="viva-unassigned-teachers" className="text-sm font-bold text-[var(--color-text)]">Unassigned Teachers</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">Search the teachers selected for this round, then add them to a panel.</p>
          <StyledInput
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search teachers"
            className="mt-4"
            disabled={controlsDisabled}
          />
          <div className="portal-scrollbar mt-3 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {unassignedExaminers.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-sm leading-6 text-[var(--color-text-muted)]">No matching unassigned teachers.</p>
            ) : unassignedExaminers.map((examiner) => (
              <div key={examiner.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                <p className="font-bold text-[var(--color-text)]">{examiner.name}</p>
                {examiner.rollNo && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{examiner.rollNo}</p>}
                <Select
                  value=""
                  aria-label={`Add ${examiner.name} to a panel`}
                  className="mt-3"
                  disabled={controlsDisabled || draftPanels.length === 0}
                  onChange={(event) => addExaminer(event.target.value, examiner.id)}
                >
                  <option value="">Add to panel...</option>
                  {panelChoices.filter(({ panel }) => panel.examinerIds.length < round.targetPanelSize).map(({ panel, number }) => (
                    <option key={panel.id} value={panel.id}>Panel {number}</option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="viva-panel-cards">
          <h3 id="viva-panel-cards" className="sr-only">Viva panels</h3>
          {draftPanels.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-5 text-sm leading-6 text-[var(--color-text-muted)]">Add a panel, then choose teachers from the unassigned list.</p>
          ) : (
            <div className="portal-scrollbar grid gap-4 2xl:max-h-[calc(100vh-19rem)] 2xl:grid-cols-3 2xl:overflow-y-auto 2xl:pr-2">
              {draftPanels.map((panel, index) => {
                const isReady = panel.examinerIds.length >= round.minimumPanelSize;
                const isFull = panel.examinerIds.length === round.targetPanelSize;
                return (
                  <article key={panel.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-[var(--color-text)]">Panel {index + 1}</h4>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant={isReady ? 'success' : 'warning'}>{isReady ? 'Ready to schedule' : `Needs ${round.minimumPanelSize - panel.examinerIds.length} more`}</Badge>
                          <Badge variant={isFull ? 'accent' : 'muted'}>{panel.examinerIds.length}/{round.targetPanelSize} teachers</Badge>
                        </div>
                      </div>
                      <Button variant="ghost" className="min-h-9 px-3" onClick={() => discardPanel(panel.id)} disabled={controlsDisabled} aria-label={`Discard panel ${index + 1}`}>
                        <Trash2 size={16} />Discard
                      </Button>
                    </div>

                    <label className="mt-4 block text-sm font-bold text-[var(--color-text)]">
                      Panel admin
                      <Select
                        value={panel.panelAdminId}
                        className="mt-2"
                        disabled={controlsDisabled || panel.examinerIds.length === 0}
                        onChange={(event) => setDraftPanels((current) => current.map((candidate) => candidate.id === panel.id ? { ...candidate, panelAdminId: event.target.value } : candidate))}
                      >
                        {panel.examinerIds.length === 0 ? <option value="">Add a teacher first</option> : null}
                        {panel.examinerIds.map((examinerId) => {
                          const examiner = examinerById.get(examinerId);
                          return <option key={examinerId} value={examinerId}>{examiner ? examiner.name : 'Unavailable teacher'}</option>;
                        })}
                      </Select>
                    </label>

                    <div className="mt-4 space-y-2">
                      {panel.examinerIds.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-text-muted)]">This empty panel will be discarded unless you add a teacher.</p>
                      ) : panel.examinerIds.map((examinerId) => {
                        const examiner = examinerById.get(examinerId);
                        const name = examiner?.name || 'Unavailable teacher';
                        const isPanelAdmin = panel.panelAdminId === examinerId;
                        return (
                          <div key={examinerId} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-[var(--color-text)]">{name}</p>
                                {examiner?.rollNo && <p className="mt-1 text-xs text-[var(--color-text-muted)]">{examiner.rollNo}</p>}
                              </div>
                              {isPanelAdmin && <Badge variant="accent">Panel admin</Badge>}
                            </div>
                            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                              <Select
                                value=""
                                aria-label={`Move ${name} to another panel`}
                                disabled={controlsDisabled || isPanelAdmin || draftPanels.length < 2}
                                title={isPanelAdmin ? 'Choose a replacement panel admin before moving this teacher.' : undefined}
                                onChange={(event) => moveExaminer(panel.id, examinerId, event.target.value)}
                              >
                                <option value="">Move to panel...</option>
                                {panelChoices.filter(({ panel: candidate }) => candidate.id !== panel.id && candidate.examinerIds.length < round.targetPanelSize).map(({ panel: candidate, number }) => (
                                  <option key={candidate.id} value={candidate.id}>Panel {number}</option>
                                ))}
                              </Select>
                              <Select
                                value=""
                                aria-label={`Swap ${name} with another teacher`}
                                disabled={controlsDisabled || isPanelAdmin || draftPanels.length < 2}
                                title={isPanelAdmin ? 'Choose a replacement panel admin before swapping this teacher.' : undefined}
                                onChange={(event) => swapExaminer(panel.id, examinerId, event.target.value)}
                              >
                                <option value="">Swap with...</option>
                                {panelChoices.flatMap(({ panel: candidate, number }) => (
                                  candidate.id === panel.id
                                    ? []
                                    : candidate.examinerIds
                                      .filter((candidateId) => candidate.panelAdminId !== candidateId)
                                      .map((candidateId) => {
                                        const candidateExaminer = examinerById.get(candidateId);
                                        return <option key={candidateId} value={candidateId}>Panel {number}: {candidateExaminer?.name || 'Unavailable teacher'}</option>;
                                      })
                                ))}
                              </Select>
                              <Button variant="ghost" className="min-h-9 px-3" onClick={() => removeExaminer(panel.id, examinerId)} disabled={controlsDisabled || isPanelAdmin} title={isPanelAdmin ? 'Choose a replacement panel admin before removing this teacher.' : undefined}>Remove</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {!isFrozen && (
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => void onReload()} disabled={controlsDisabled}>Reload Panels</Button>
          <Button onClick={() => void savePanels()} disabled={controlsDisabled}>{isSaving ? <Loader2 className="animate-spin" size={16} /> : null}{isSaving ? 'Saving...' : 'Save Panels'}</Button>
        </div>
      )}
    </DashboardPanel>
  );
}
