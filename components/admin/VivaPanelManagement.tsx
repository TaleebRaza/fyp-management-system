'use client';

import { useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, MoveRight, Shuffle, Trash2, UserMinus } from 'lucide-react';

import type { VivaPanelDto } from '../../lib/vivaPanelAdmin';
import type { VivaExaminerOption, VivaRoundDto } from '../../lib/vivaRoundAdmin';
import { Badge, Button, DashboardPanel, Dialog, SectionHeader, Select, StyledInput } from '../ui';

type VivaPanelDraft = {
  id: string;
  examinerIds: string[];
  panelAdminId: string;
};

type PendingPanelAction =
  | { type: 'move'; panelId: string; examinerId: string }
  | { type: 'swap'; panelId: string; examinerId: string };

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
  const [nextDraftId, setNextDraftId] = useState(1);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(() => round.panelRevision === 0);
  const [pendingAction, setPendingAction] = useState<PendingPanelAction | null>(null);
  const [actionTargetId, setActionTargetId] = useState('');
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const isFrozen = Boolean(round.frozenAt || round.confirmedAt);
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
  const allUnassignedExaminers = useMemo(() => (
    examiners.filter((examiner) => (
      selectedExaminerIds.has(examiner.id) && !assignedExaminerIds.has(examiner.id)
    ))
  ), [assignedExaminerIds, examiners, selectedExaminerIds]);
  const unassignedExaminers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return allUnassignedExaminers.filter((examiner) => {
      return !normalizedSearch
        || `${examiner.name} ${examiner.rollNo}`.toLocaleLowerCase().includes(normalizedSearch);
    });
  }, [allUnassignedExaminers, search]);
  const panelNumberById = useMemo(
    () => new Map(panelChoices.map(({ panel, number }) => [panel.id, number])),
    [panelChoices]
  );
  const pendingExaminer = pendingAction ? examinerById.get(pendingAction.examinerId) : null;
  const pendingPanelNumber = pendingAction ? panelNumberById.get(pendingAction.panelId) : null;
  const actionCandidates = useMemo(() => {
    if (!pendingAction) return [];
    if (pendingAction.type === 'move') {
      return panelChoices
        .filter(({ panel }) => panel.id !== pendingAction.panelId && panel.examinerIds.length < round.targetPanelSize)
        .map(({ panel, number }) => ({ id: panel.id, label: `Panel ${number}` }));
    }

    return panelChoices.flatMap(({ panel, number }) => (
      panel.id === pendingAction.panelId
        ? []
        : panel.examinerIds
          .filter((examinerId) => panel.panelAdminId !== examinerId)
          .map((examinerId) => ({
            id: examinerId,
            label: `Panel ${number}: ${examinerById.get(examinerId)?.name || 'Unavailable teacher'}`,
          }))
    ));
  }, [examinerById, panelChoices, pendingAction, round.targetPanelSize]);
  const panelsAreSaved = !hasUnsavedChanges && round.panelRevision > 0;
  const hasUnassignedTeachers = allUnassignedExaminers.length > 0;

  const markDraftChanged = () => {
    setError('');
    setSavedMessage('');
    setHasUnsavedChanges(true);
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
    markDraftChanged();
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
    markDraftChanged();
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
    markDraftChanged();
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
    markDraftChanged();
  };

  const setPanelAdmin = (panelId: string, panelAdminId: string) => {
    setDraftPanels((current) => current.map((panel) => (
      panel.id === panelId ? { ...panel, panelAdminId } : panel
    )));
    markDraftChanged();
  };

  const discardPanel = (panelId: string) => {
    setDraftPanels((current) => current.filter((panel) => panel.id !== panelId));
    markDraftChanged();
  };

  const openPanelAction = (action: PendingPanelAction) => {
    setPendingAction(action);
    setActionTargetId('');
  };

  const closePanelAction = () => {
    setPendingAction(null);
    setActionTargetId('');
  };

  const confirmPanelAction = () => {
    if (!pendingAction || !actionTargetId) return;
    if (pendingAction.type === 'move') {
      moveExaminer(pendingAction.panelId, pendingAction.examinerId, actionTargetId);
    } else {
      swapExaminer(pendingAction.panelId, pendingAction.examinerId, actionTargetId);
    }
    closePanelAction();
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
      setHasUnsavedChanges(false);
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
      setHasUnsavedChanges(true);
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
          </div>
        }
      />

      {error && <p role="alert" className="mb-4 rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
      {savedMessage && <p role="status" className="mb-4 rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-success)]">{savedMessage}</p>}

      <div className={`grid gap-5 ${hasUnassignedTeachers ? '2xl:grid-cols-[15rem_minmax(0,1fr)]' : ''}`}>
        {hasUnassignedTeachers && (
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
        )}

        <section aria-labelledby="viva-panel-cards">
          <h3 id="viva-panel-cards" className="sr-only">Viva panels</h3>
          {draftPanels.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--color-border)] p-5 text-sm leading-6 text-[var(--color-text-muted)]">Generate a panel draft to begin.</p>
          ) : (
            <div className={`portal-scrollbar grid gap-4 lg:grid-cols-2 2xl:grid-cols-3 ${hasUnassignedTeachers ? '2xl:max-h-[calc(100vh-19rem)] 2xl:overflow-y-auto 2xl:pr-2' : ''}`}>
              {draftPanels.map((panel, index) => {
                const isReady = panel.examinerIds.length >= round.minimumPanelSize;
                const isFull = panel.examinerIds.length === round.targetPanelSize;
                const moveTargets = panelChoices.filter(({ panel: candidate }) => (
                  candidate.id !== panel.id && candidate.examinerIds.length < round.targetPanelSize
                ));
                const swapTargets = panelChoices.flatMap(({ panel: candidate }) => (
                  candidate.id === panel.id
                    ? []
                    : candidate.examinerIds.filter((candidateId) => candidate.panelAdminId !== candidateId)
                ));
                return (
                  <article key={panel.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-[var(--color-text)]">Panel {index + 1}</h4>
                        </div>
                        <div className="mt-2 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
                          <Badge variant={isReady ? 'success' : 'warning'}>{isReady ? 'Ready to schedule' : `Needs ${round.minimumPanelSize - panel.examinerIds.length} more`}</Badge>
                          <Badge variant={isFull ? 'accent' : 'muted'}>{panel.examinerIds.length}/{round.targetPanelSize}</Badge>
                        </div>
                      </div>
                      <Button variant="ghost" className="min-h-9 w-9 shrink-0 px-0!" onClick={() => discardPanel(panel.id)} disabled={controlsDisabled} aria-label={`Discard panel ${index + 1}`} title={`Discard panel ${index + 1}`}>
                        <Trash2 size={16} />
                      </Button>
                    </div>

                    <label className="mt-4 block text-sm font-bold text-[var(--color-text)]">
                      Panel admin
                      <Select
                        value={panel.panelAdminId}
                        className="mt-2"
                        disabled={controlsDisabled || panel.examinerIds.length === 0}
                        onChange={(event) => setPanelAdmin(panel.id, event.target.value)}
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
                            <div className="mt-3 flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                className="min-h-10 w-10 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-primary-soft)] p-0! text-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white"
                                onClick={() => openPanelAction({ type: 'move', panelId: panel.id, examinerId })}
                                disabled={controlsDisabled || isPanelAdmin || moveTargets.length === 0}
                                aria-label={`Move ${name} to another panel`}
                                title={isPanelAdmin ? 'Choose a replacement panel admin before moving this teacher.' : moveTargets.length === 0 ? 'No panel has room for this teacher.' : 'Move to another panel'}
                              >
                                <MoveRight size={20} strokeWidth={2.5} aria-hidden="true" />
                              </Button>
                              <Button
                                variant="ghost"
                                className="min-h-10 w-10 shrink-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-soft)] p-0! text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-black"
                                onClick={() => openPanelAction({ type: 'swap', panelId: panel.id, examinerId })}
                                disabled={controlsDisabled || isPanelAdmin || swapTargets.length === 0}
                                aria-label={`Swap ${name} with another teacher`}
                                title={isPanelAdmin ? 'Choose a replacement panel admin before swapping this teacher.' : swapTargets.length === 0 ? 'No teacher is available to swap.' : 'Swap with another teacher'}
                              >
                                <ArrowLeftRight size={20} strokeWidth={2.5} aria-hidden="true" />
                              </Button>
                              <Button
                                variant="ghost"
                                className="min-h-10 w-10 shrink-0 rounded-lg border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-0! text-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white"
                                onClick={() => removeExaminer(panel.id, examinerId)}
                                disabled={controlsDisabled || isPanelAdmin}
                                aria-label={`Remove ${name} from panel ${index + 1}`}
                                title={isPanelAdmin ? 'Choose a replacement panel admin before removing this teacher.' : 'Remove from panel'}
                              >
                                <UserMinus size={20} strokeWidth={2.5} aria-hidden="true" />
                              </Button>
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
          <Button variant={panelsAreSaved ? 'success' : 'danger'} onClick={() => void savePanels()} disabled={controlsDisabled || panelsAreSaved}>
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : null}
            {isSaving ? 'Saving...' : panelsAreSaved ? 'Panels Saved' : 'Save Panels'}
          </Button>
        </div>
      )}

      <Dialog
        open={Boolean(pendingAction)}
        onClose={closePanelAction}
        title={pendingAction?.type === 'swap' ? 'Swap teacher' : 'Move teacher'}
        description={pendingExaminer && pendingPanelNumber ? `${pendingExaminer.name} is currently in Panel ${pendingPanelNumber}.` : undefined}
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={closePanelAction}>Cancel</Button>
            <Button onClick={confirmPanelAction} disabled={!actionTargetId}>
              {pendingAction?.type === 'swap' ? 'Swap Teacher' : 'Move Teacher'}
            </Button>
          </>
        )}
      >
        <label className="block text-sm font-bold text-[var(--color-text)]">
          {pendingAction?.type === 'swap' ? 'Swap with' : 'Move to'}
          <Select value={actionTargetId} className="mt-2" onChange={(event) => setActionTargetId(event.target.value)}>
            <option value="">Choose an option...</option>
            {actionCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.label}</option>
            ))}
          </Select>
        </label>
      </Dialog>
    </DashboardPanel>
  );
}
