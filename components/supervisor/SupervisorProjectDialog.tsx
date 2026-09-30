import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRightLeft,
  CheckCircle,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Milestone,
  UserMinus,
  Users,
  Wrench,
} from 'lucide-react';
import { EXPANDED_TEAM_SIZE, getTeamCapacity } from '../../config/appSettings';
import {
  getProjectRatingRound,
  parseProjectRatingValues,
  type ProjectRatingCategoryKey,
  type ProjectRatingRound,
  type ProjectRatingValues,
} from '../../config/projectRatings';
import { ApprovalRatingForm, type PendingProjectRatings } from '../project-ratings/ApprovalRatingForm';
import { ProjectRatingsDisplay } from '../project-ratings/ProjectRatingsDisplay';
import { AvatarBadge, Badge, Button, Dialog, EmptyState, StyledInput } from '../ui';
import { Timeline, getProjectStageLabel } from '../ui/Timeline';
import {
  getMemberNames,
  getMemberRollNumbers,
  getProgramName,
  getProjectDomainDisplayLabels,
  getProjectProgram,
  getSafePdfKey,
  getStatusLabel,
  getStatusVariant,
} from './SupervisorProjectCard';
import type { SupervisorProject } from './supervisorDashboardTypes';

type ProjectManagement = {
  migrationStudentId: string;
  onMigrationStudentChange: (studentId: string) => void;
  migrationCode: string;
  onMigrationCodeChange: (value: string) => void;
  onMigrate: () => void;
  onExpandTeam: () => void;
  onRemoveTeam: () => void;
};

type ProjectView = 'actions' | 'details' | 'team';

export default function SupervisorProjectDialog({
  project,
  onClose,
  isProcessingAction,
  onAction,
  onProgress,
  progressionRequestId = 0,
  management,
}: {
  project: SupervisorProject | null;
  onClose: () => void;
  isProcessingAction: boolean;
  onAction: (
    project: SupervisorProject,
    status: string,
    approval?: {
      ratings: ProjectRatingValues;
      remarks: string;
      reviewRatingRound?: ProjectRatingRound;
      isReviewEdit?: boolean;
    }
  ) => void;
  onProgress: (
    project: SupervisorProject,
    progression?: { ratings?: ProjectRatingValues; remarks: string }
  ) => void;
  progressionRequestId?: number;
  management?: ProjectManagement;
}) {
  const [view, setView] = useState<ProjectView>('actions');
  const [ratingProjectId, setRatingProjectId] = useState<string | null>(null);
  const [ratingFormMode, setRatingFormMode] = useState<'progress' | 'edit' | null>(null);
  const [approvalRatings, setApprovalRatings] = useState<PendingProjectRatings>({});
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [reviewRatingRound, setReviewRatingRound] = useState<ProjectRatingRound | null>(null);
  const [isOpeningDocument, setIsOpeningDocument] = useState(false);
  const handledProgressionRequest = useRef(0);
  const projectId = project?._id ?? null;
  const isRatingFormOpen = projectId !== null && ratingProjectId === projectId;
  const isProgressionForm = ratingFormMode === 'progress';
  const selectedPdfKey = getSafePdfKey(project?.pdfUrl);
  const domainLabels = getProjectDomainDisplayLabels(project);
  const completeRatings = parseProjectRatingValues(approvalRatings);
  const isSubmittedForReview = project?.status === 'Submitted For Review';
  const isProgressable = project?.status === 'Document Approved';

  const handleApprove = () => {
    if (!project) return;
    onAction(project, 'Document Approved');
  };

  const handleStartProgression = useCallback(() => {
    if (!project || !isProgressable) return;
    if (getProjectRatingRound(project.stage)) {
      setApprovalRatings({});
      setApprovalRemarks('');
      setReviewRatingRound(null);
      setRatingFormMode('progress');
      setRatingProjectId(project._id);
      return;
    }
    onProgress(project, { remarks: 'Final deliverables approved.' });
  }, [isProgressable, onProgress, project]);

  useEffect(() => {
    if (progressionRequestId <= handledProgressionRequest.current
      || project?.status !== 'Document Approved') return;
    handledProgressionRequest.current = progressionRequestId;
    const timer = window.setTimeout(handleStartProgression, 0);
    return () => window.clearTimeout(timer);
  }, [handleStartProgression, progressionRequestId, project?.status]);

  const handleRatingChange = (category: ProjectRatingCategoryKey, value: number) => {
    setApprovalRatings((current) => ({ ...current, [category]: value }));
  };

  const handleClose = () => {
    setView('actions');
    setRatingProjectId(null);
    setRatingFormMode(null);
    setApprovalRatings({});
    setApprovalRemarks('');
    setReviewRatingRound(null);
    setIsOpeningDocument(false);
    onClose();
  };

  const handleReviewRating = (round: ProjectRatingRound) => {
    if (!project) return;
    const snapshot = project.ratings?.[round];
    const reviewRemarks = project.reviewRemarks ?? project.remarks ?? '';
    setRatingProjectId(project._id);
    setRatingFormMode('edit');
    setReviewRatingRound(round);
    setApprovalRatings(snapshot ? {
      projectIdea: snapshot.projectIdea,
      technicalMerit: snapshot.technicalMerit,
      documentationQuality: snapshot.documentationQuality,
    } : {});
    setApprovalRemarks(reviewRemarks);
  };

  const handleOpenDocument = () => {
    if (!project || !selectedPdfKey) return;
    setIsOpeningDocument(true);
    window.open(`/api/read-pdf?url=${encodeURIComponent(selectedPdfKey)}`, '_blank', 'noopener,noreferrer');
    setTimeout(() => setIsOpeningDocument(false), 250);
  };

  const actionDisabled = !project?.projectTitle || !project?.pdfUrl || !isSubmittedForReview || isProcessingAction;

  return (
    <Dialog
      open={!!project}
      onClose={isProcessingAction ? () => undefined : handleClose}
      title={isRatingFormOpen ? (isProgressionForm ? 'Progress project stage' : 'Review rating') : (project?.projectTitle || getMemberNames(project))}
      description={isRatingFormOpen ? getMemberNames(project) : (project ? `${getMemberNames(project)} · ${getMemberRollNumbers(project)}` : '')}
      size="xl"
      footer={
        project ? (
          isRatingFormOpen ? (
            <>
              <Button variant="outline" disabled={isProcessingAction} onClick={() => setRatingProjectId(null)}>Cancel</Button>
              <Button type="submit" form="project-approval-rating-form" variant="success" disabled={!completeRatings || isProcessingAction}>
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                {isProcessingAction ? (isProgressionForm ? 'Progressing...' : 'Updating rating...') : (isProgressionForm ? 'Save ratings and progress' : 'Update rating')}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose}>Close</Button>
          )
        ) : null
      }
    >
      {project && isRatingFormOpen ? (
        <form
          id="project-approval-rating-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (completeRatings) {
              if (isProgressionForm) {
                onProgress(project, { ratings: completeRatings, remarks: approvalRemarks });
              } else {
                onAction(project, 'Document Approved', {
                  ratings: completeRatings,
                  remarks: approvalRemarks,
                  reviewRatingRound: reviewRatingRound || undefined,
                  isReviewEdit: true,
                });
              }
            }
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-muted)] p-3">
            <div>
              <p className="text-xs font-extrabold text-[var(--color-text)]">{getProjectStageLabel(project.stage || 'PROPOSAL')}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{isProgressionForm ? 'Rate this stage before progressing.' : 'Review the saved stage rating.'}</p>
            </div>
            <Button type="button" variant="outline" onClick={handleOpenDocument} disabled={!selectedPdfKey || isOpeningDocument || isProcessingAction}>
              {isOpeningDocument ? <Loader2 className="animate-spin" size={15} /> : <ExternalLink size={15} />}
              Open document
            </Button>
          </div>
          <ApprovalRatingForm
            ratings={approvalRatings}
            remarks={approvalRemarks}
            stageLabel={getProjectStageLabel(project.stage || 'PROPOSAL')}
            version={Number(project.version || 0)}
            disabled={isProcessingAction}
            onRatingChange={handleRatingChange}
            onRemarksChange={setApprovalRemarks}
            heading={isProgressionForm ? 'Rate and progress this stage' : 'Update saved rating'}
            description={isProgressionForm
              ? `These ratings will be saved for ${getProjectStageLabel(project.stage || 'PROPOSAL')} when the project progresses.`
              : undefined}
          />
        </form>
      ) : project ? (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="portal-segmented" aria-label="Project workspace views">
              {(['actions', 'details', ...(management ? ['team'] : [])] as ProjectView[]).map((item) => (
                <button key={item} type="button" data-active={view === item} onClick={() => setView(item)}>
                  {item === 'actions' ? 'Actions' : item === 'details' ? 'Details' : 'Team'}
                </button>
              ))}
            </div>
            <Badge variant={getStatusVariant(project.status)}>{getStatusLabel(project.status)}</Badge>
          </div>

          {view === 'actions' && (
            <div className="portal-bento">
              <section className="portal-bento-tile portal-bento-soft p-4 sm:p-5 md:col-span-7">
                <p className="portal-eyebrow">Decision workspace</p>
                <h3 className="mt-1 text-xl font-black tracking-tight text-[var(--color-text)]">{project.projectTitle || 'Project details not submitted yet'}</h3>
                <div className="mt-4 space-y-2">
                  {(project.members || []).map((member) => (
                    <div key={member._id || member.rollNo || member.email} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-[var(--color-text)]">{member.name || 'Student'}</p>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{member.rollNo || member.email || 'No identifier'}</p>
                      </div>
                      <Badge variant="muted">{getProgramName(member.program || getProjectProgram(project))}</Badge>
                    </div>
                  ))}
                </div>
              </section>

              <section className="portal-bento-tile portal-bento-accent p-4 sm:p-5 md:col-span-5">
                <p className="portal-eyebrow">Current state</p>
                <h3 className="mt-2 text-lg font-black text-[var(--color-text)]">{getStatusLabel(project.status)}</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
                  {isSubmittedForReview ? 'A new document is ready for your decision.' : 'No new document is waiting for a decision.'}
                </p>
                <div className="mt-4 text-xs font-bold text-[var(--color-text-muted)]">
                  {getProjectStageLabel(project.stage || 'PROPOSAL')} · Version {Number(project.version || 0)}
                </div>
              </section>

              <section className="portal-bento-tile p-4 sm:p-5 md:col-span-12">
                <p className="portal-eyebrow">Decision</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="success" disabled={actionDisabled} onClick={handleApprove}>
                    {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}Approve
                  </Button>
                  <Button variant="accent" disabled={actionDisabled} onClick={() => onAction(project, 'Changes Requested')}>
                    {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}Request changes
                  </Button>
                  {isProgressable && (
                    <Button variant="primary" disabled={isProcessingAction} onClick={handleStartProgression}>
                      {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <Milestone size={16} />}
                      {project.stage === 'FINAL_DELIVERABLES' ? 'Complete project' : 'Progress stage'}
                    </Button>
                  )}
                </div>
                {!isSubmittedForReview && !isProgressable && <p className="mt-3 text-xs text-[var(--color-text-muted)]">Decision controls activate when a submitted document is waiting for review.</p>}
                {isProgressable && <p className="mt-3 text-xs text-[var(--color-text-muted)]">The document is approved. Progress now or leave the project in this stage for another submission.</p>}
              </section>
            </div>
          )}

          {view === 'details' && (
            <div className="portal-bento">
              <section className="portal-bento-tile p-4 sm:p-5 md:col-span-8">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="portal-eyebrow">Project details</p>
                    <h3 className="mt-1 text-lg font-black text-[var(--color-text)]">{project.projectTitle || 'Project details not submitted yet'}</h3>
                  </div>
                  {selectedPdfKey ? (
                    <Button variant="outline" onClick={handleOpenDocument} disabled={isOpeningDocument}>
                      {isOpeningDocument ? <Loader2 className="animate-spin" size={15} /> : <ExternalLink size={15} />}View PDF
                    </Button>
                  ) : null}
                </div>
                {project.projectTitle ? (
                  <>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {domainLabels.map((domainLabel) => <Badge key={domainLabel} variant="accent"><Globe size={13} />{domainLabel}</Badge>)}
                      {project.tools && <Badge variant="muted"><Wrench size={13} />{project.tools}</Badge>}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-[var(--color-text-muted)]">{project.projectDesc || 'No project description provided.'}</p>
                  </>
                ) : (
                  <div className="mt-4"><EmptyState title="Project details not submitted" description="This team has not submitted its title, description, tools, and PDF yet." icon={<FileText size={28} />} /></div>
                )}
              </section>

              <section className="portal-bento-tile portal-bento-soft p-4 sm:p-5 md:col-span-4">
                <p className="portal-eyebrow">Snapshot</p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-[var(--color-text-muted)]">Program</span><strong>{getProgramName(getProjectProgram(project))}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-[var(--color-text-muted)]">Batch</span><strong>{project.batch || 'Not assigned'}</strong></div>
                  <div className="flex justify-between gap-3"><span className="text-[var(--color-text-muted)]">Team</span><strong>{project.members?.length || 0} / {getTeamCapacity(project.maxTeamSize)}</strong></div>
                </div>
              </section>

              <section className="portal-bento-tile p-4 sm:p-5 md:col-span-7">
                <p className="portal-eyebrow">Stage</p>
                <div className="mt-3"><Timeline currentStage={project.stage || 'PROPOSAL'} descriptionSuffix="based on the current project stage." /></div>
              </section>

              <section className="portal-bento-tile p-4 sm:p-5 md:col-span-5">
                <p className="portal-eyebrow">Ratings</p>
                <div className="mt-3">
                  <ProjectRatingsDisplay ratings={project.ratings} stage={project.stage || 'PROPOSAL'} onReviewRating={management ? handleReviewRating : undefined} />
                  {project.stage === 'PROPOSAL' ? <p className="mt-2 text-xs text-[var(--color-text-muted)]">Ratings appear after a stage is approved.</p> : null}
                </div>
              </section>
            </div>
          )}

          {view === 'team' && management && (
            <div className="portal-bento">
              <section className="portal-bento-tile p-4 sm:p-5 md:col-span-7">
                <p className="portal-eyebrow">Team members</p>
                <div className="mt-3 space-y-2">
                  {(project.members || []).map((member) => (
                    <div key={member._id || member.rollNo || member.email} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-muted)] p-3">
                      <AvatarBadge name={member.name} className="h-9 w-9 rounded-lg text-xs" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-[var(--color-text)]">{member.name || 'Student'}</p>
                        <p className="truncate text-xs text-[var(--color-text-muted)]">{member.rollNo || member.email || 'No identifier'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="portal-bento-tile portal-bento-soft p-4 sm:p-5 md:col-span-5">
                <p className="portal-eyebrow">Capacity</p>
                <h3 className="mt-2 text-xl font-black text-[var(--color-text)]">{project.members?.length || 0} of {getTeamCapacity(project.maxTeamSize)} students</h3>
                <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">A third member must be explicitly allowed by the supervisor.</p>
                {getTeamCapacity(project.maxTeamSize) < EXPANDED_TEAM_SIZE && (
                  <Button className="mt-4" variant="outline" disabled={isProcessingAction} onClick={management.onExpandTeam}><Users size={16} />Allow 3 members</Button>
                )}
              </section>

              <section className="portal-bento-tile p-4 sm:p-5 md:col-span-12">
                <p className="portal-eyebrow">Migrate student</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <select value={management.migrationStudentId} onChange={(event) => management.onMigrationStudentChange(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]">
                    {(project.members || []).map((member) => <option key={member._id} value={member._id}>{member.name} ({member.rollNo || member.email})</option>)}
                  </select>
                  <StyledInput value={management.migrationCode} onChange={(event) => management.onMigrationCodeChange(event.target.value.toUpperCase())} placeholder="Target migration code" />
                  <Button variant="primary" disabled={isProcessingAction || !management.migrationStudentId} onClick={management.onMigrate}>
                    {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <ArrowRightLeft size={16} />}Migrate
                  </Button>
                </div>

                <details className="portal-disclosure mt-5">
                  <summary>Danger zone</summary>
                  <div>
                    <p className="mb-3 text-xs leading-5 text-[var(--color-text-muted)]">Removing the team is a destructive project-management action. Use it only when the complete team association must be cleared.</p>
                    <Button variant="danger" disabled={isProcessingAction} onClick={management.onRemoveTeam}><UserMinus size={16} />Remove team</Button>
                  </div>
                </details>
              </section>
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
