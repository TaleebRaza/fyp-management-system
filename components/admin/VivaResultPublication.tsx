'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';

import type {
  VivaAssessmentDto,
  VivaPublicationFailure,
  VivaPublicationResult,
} from '../../lib/vivaPublication';
import type { VivaRoundDto } from '../../lib/vivaRoundAdmin';
import { Badge, Button, DashboardPanel, SectionHeader } from '../ui';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readPerson(value: unknown) {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.rollNo === 'string'
    ? { id: value.id, name: value.name, rollNo: value.rollNo }
    : null;
}

function readPeople(value: unknown) {
  if (!Array.isArray(value)) return null;

  const people = value.map(readPerson);
  return people.every((person): person is NonNullable<typeof person> => Boolean(person))
    ? people
    : null;
}

function readAssessment(value: unknown): VivaAssessmentDto | null {
  if (!isRecord(value)) return null;

  const project = isRecord(value.project) ? value.project : null;
  const panel = isRecord(value.panel) ? value.panel : null;
  const round = isRecord(value.round) ? value.round : null;
  const result = isRecord(value.result) ? value.result : null;
  const projectMembers = project ? readPeople(project.members) : null;
  const panelMembers = panel ? readPeople(panel.members) : null;
  const panelAdmin = panel ? readPerson(panel.admin) : null;
  if (
    typeof value.id !== 'string'
    || typeof value.roundId !== 'string'
    || typeof value.completedAt !== 'string'
    || (value.publishedAt !== null && typeof value.publishedAt !== 'string')
    || !round
    || typeof round.name !== 'string'
    || !result
    || typeof result.grade !== 'string'
    || typeof result.percentage !== 'number'
    || !project
    || typeof project.id !== 'string'
    || typeof project.title !== 'string'
    || !projectMembers
    || projectMembers.length === 0
    || !panel
    || typeof panel.id !== 'string'
    || !panelAdmin
    || !panelMembers
    || panelMembers.length === 0
  ) {
    return null;
  }

  return {
    id: value.id,
    roundId: value.roundId,
    completedAt: value.completedAt,
    publishedAt: value.publishedAt,
    result: { grade: result.grade, percentage: result.percentage },
    round: { name: round.name },
    project: { id: project.id, title: project.title, members: projectMembers },
    panel: { id: panel.id, admin: panelAdmin, members: panelMembers },
  };
}

function readFailures(value: unknown): VivaPublicationFailure[] | null {
  if (!Array.isArray(value)) return null;

  const failures = value.map((item) => (
    isRecord(item) && typeof item.sessionId === 'string' && typeof item.error === 'string'
      ? { sessionId: item.sessionId, error: item.error }
      : null
  ));
  return failures.every((failure): failure is VivaPublicationFailure => Boolean(failure)) ? failures : null;
}

function readPublication(value: unknown): VivaPublicationResult | null {
  if (!isRecord(value)) return null;

  const published = Array.isArray(value.published) ? value.published.map(readAssessment) : null;
  const alreadyPublished = Array.isArray(value.alreadyPublished)
    ? value.alreadyPublished.map(readAssessment)
    : null;
  const failures = readFailures(value.failures);
  if (
    !published?.every((assessment): assessment is VivaAssessmentDto => Boolean(assessment))
    || !alreadyPublished?.every((assessment): assessment is VivaAssessmentDto => Boolean(assessment))
    || !failures
  ) {
    return null;
  }

  return { published, alreadyPublished, failures };
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';

  return new Intl.DateTimeFormat('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function VivaResultPublication({
  round,
  assessments,
  onPublished,
}: {
  round: VivaRoundDto;
  assessments: VivaAssessmentDto[];
  onPublished: (updatedAssessments: VivaAssessmentDto[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const roundAssessments = useMemo(
    () => assessments.filter((assessment) => assessment.roundId === round.id),
    [assessments, round.id]
  );
  const unpublishedAssessments = roundAssessments.filter((assessment) => !assessment.publishedAt);
  const allUnpublishedSelected = unpublishedAssessments.length > 0
    && unpublishedAssessments.every((assessment) => selectedIds.includes(assessment.id));

  const toggleSelection = (assessmentId: string) => {
    setSelectedIds((current) => current.includes(assessmentId)
      ? current.filter((id) => id !== assessmentId)
      : [...current, assessmentId]);
  };

  const publish = async (sessionIds: string[]) => {
    if (isPublishing || sessionIds.length === 0) return;

    setIsPublishing(true);
    setError('');
    setSavedMessage('');
    try {
      const response = await fetch('/api/admin/viva', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish-results', sessionIds }),
      });
      const body: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : 'Unable to publish Viva results.');
      }

      const publication = isRecord(body) ? readPublication(body.publication) : null;
      if (!publication) throw new Error('Viva publication response was invalid.');

      onPublished([...publication.published, ...publication.alreadyPublished]);
      setSelectedIds((current) => current.filter((id) => !sessionIds.includes(id)));
      if (publication.published.length > 0) {
        setSavedMessage(`${publication.published.length} Viva result${publication.published.length === 1 ? '' : 's'} published.`);
      } else if (publication.alreadyPublished.length > 0) {
        setSavedMessage('The selected Viva results were already published.');
      }
      if (publication.failures.length > 0) {
        setError(`${publication.failures.length} result${publication.failures.length === 1 ? '' : 's'} not published: ${publication.failures[0].error}`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to publish Viva results.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <DashboardPanel>
      <SectionHeader
        title="Review and Publish Results"
        description="Published grades are taken from the completed session snapshot and cannot be changed."
        action={
          unpublishedAssessments.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setSelectedIds(allUnpublishedSelected ? [] : unpublishedAssessments.map(({ id }) => id))}
                disabled={isPublishing}
              >
                {allUnpublishedSelected ? 'Clear selection' : 'Select all unpublished'}
              </Button>
              <Button
                onClick={() => void publish(selectedIds)}
                disabled={isPublishing || selectedIds.length === 0}
              >
                {isPublishing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                {isPublishing ? 'Publishing...' : `Publish selected (${selectedIds.length})`}
              </Button>
            </div>
          ) : undefined
        }
      />
      {error && <p role="alert" className="mb-4 rounded-xl bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-danger)]">{error}</p>}
      {savedMessage && <p role="status" className="mb-4 rounded-xl bg-[var(--color-success-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-success)]">{savedMessage}</p>}

      {roundAssessments.length === 0 ? (
        <p className="text-sm leading-6 text-[var(--color-text-muted)]">No completed Viva results are ready for review in this round.</p>
      ) : (
        <div className="space-y-3">
          {roundAssessments.map((assessment) => {
            const isPublished = Boolean(assessment.publishedAt);
            const isSelected = selectedIds.includes(assessment.id);
            return (
              <article key={assessment.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!isPublished && (
                        <input
                          id={`viva-publish-${assessment.id}`}
                          type="checkbox"
                          checked={isSelected}
                          disabled={isPublishing}
                          onChange={() => toggleSelection(assessment.id)}
                          className="h-4 w-4 accent-[var(--color-accent)]"
                        />
                      )}
                      <h3 className="font-bold text-[var(--color-text)]">{assessment.project.title}</h3>
                      <Badge variant="success">{assessment.result.grade} ({assessment.result.percentage}%)</Badge>
                      <Badge variant={isPublished ? 'success' : 'warning'}>{isPublished ? 'Published' : 'Unpublished'}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                      Completed {formatDateTime(assessment.completedAt)}. Panel admin: {assessment.panel.admin.name} ({assessment.panel.admin.rollNo}).
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Team: {assessment.project.members.map((member) => member.name).join(', ')}. Panel: {assessment.panel.members.map((member) => member.name).join(', ')}.
                    </p>
                    {assessment.publishedAt && (
                      <p className="mt-1 text-xs text-[var(--color-success)]">Published {formatDateTime(assessment.publishedAt)}.</p>
                    )}
                  </div>
                  {isPublished ? (
                    <CheckCircle2 className="shrink-0 text-[var(--color-success)]" aria-label="Published" size={22} />
                  ) : (
                    <Button variant="outline" onClick={() => void publish([assessment.id])} disabled={isPublishing}>
                      <Upload size={16} />Publish
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </DashboardPanel>
  );
}
