import { useState } from 'react';
import { ArrowRightLeft, CheckCircle, ExternalLink, FileText, Globe, Loader2, UserMinus, Users, Wrench } from 'lucide-react';
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
import { AvatarBadge, Badge, Button, DashboardPanel, Dialog, EmptyState, SectionHeader, StyledInput } from '../ui';
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

type ProjectDialogView = 'actions' | 'details' | 'team';

type ProjectManagement = {
  migrationStudentId: string;
  onMigrationStudentChange: (studentId: string) => void;
  migrationCode: string;
  onMigrationCodeChange: (value: string) => void;
  onMigrate: () => void;
  onExpandTeam: () => void;
  onRemoveTeam: () => void;
};

export default function SupervisorProjectDialog({
  project,
  onClose,
  isProcessingAction,
  onAction,
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
  management?: ProjectManagement;
}) {
  const [approvalProjectId, setApprovalProjectId] = useState<string | null>(null);
  const [approvalRatings, setApprovalRatings] = useState<PendingProjectRatings>({});
  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [reviewRatingRound, setReviewRatingRound] = useState<ProjectRatingRound | null>(null);
  const [isOpeningDocument, setIsOpeningDocument] = useState(false);
  const [projectViewState, setProjectViewState] = useState<{ projectId: string | null; view: ProjectDialogView }>({
    projectId: null,
    view: 'actions',
  });
  const projectId = project?._id ?? null;
  const isApprovalFormOpen = projectId !== null && approvalProjectId === projectId;
  const selectedPdfKey = getSafePdfKey(project?.pdfUrl);
  const domainLabels = getProjectDomainDisplayLabels(project);
  const completeRatings = parseProjectRatingValues(approvalRatings);
  const isSubmittedForReview = project?.status === 'Submitted For Review';
  const hasManagement = Boolean(management);
  const activeView: ProjectDialogView = projectId && projectViewState.projectId !== projectId
    ? 'actions'
    : hasManagement
      ? projectViewState.view
      : projectViewState.view === 'team'
        ? 'actions'
        : projectViewState.view;
  const viewTabs: ProjectDialogView[] = hasManagement ? ['actions', 'details', 'team'] : ['actions', 'details'];

  const handleApprove = () => {
    if (!project) return;
    setReviewRatingRound(null);
    setApprovalRatings({});
    setApprovalRemarks('');
    if (getProjectRatingRound(project.stage)) {
      setApprovalProjectId(project._id);
      return;
    }
    onAction(project, 'Approved');
  };

  const handleRatingChange = (category: ProjectRatingCategoryKey, value: number) => {
    setApprovalRatings((current) => ({ ...current, [category]: value }));
  };

  const handleClose = () => {
    setApprovalProjectId(null);
    setApprovalRatings({});
    setApprovalRemarks('');
    setReviewRatingRound(null);
    setProjectViewState({ projectId: null, view: 'actions' });
    setIsOpeningDocument(false);
    onClose();
  };

  const handleReviewRating = (round: ProjectRatingRound) => {
    if (!project) return;
    const snapshot = project.ratings?.[round];
    const reviewRemarks = project.reviewRemarks ?? project.remarks ?? '';
    setApprovalProjectId(project._id);
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

  const setDialogView = (view: ProjectDialogView) => {
    if (!projectId) return;
    setProjectViewState({ projectId, view });
  };

  return (
    <Dialog
      open={!!project}
      onClose={isProcessingAction ? () => undefined : handleClose}
      title={isApprovalFormOpen ? (reviewRatingRound ? 'Review rating' : 'Approve project and save ratings') : project?.projectTitle || 'Project details not submitted yet'}
      description={project ? `${getMemberNames(project)} · ${getMemberRollNumbers(project)}` : ''}
      size="xl"
      footer={
        project ? (
          isApprovalFormOpen ? (
            <>
              <Button variant="outline" disabled={isProcessingAction} onClick={() => setApprovalProjectId(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="project-approval-rating-form"
                variant="success"
                disabled={!completeRatings || isProcessingAction}
              >
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                {isProcessingAction ? (reviewRatingRound ? 'Updating rating...' : 'Approving...') : (reviewRatingRound ? 'Update rating' : 'Approve and save ratings')}
              </Button>
            </>
          ) : activeView === 'actions' ? (
            <>
              <Button variant="outline" onClick={handleClose}>Close</Button>
              <Button variant="success" disabled={!project.projectTitle || !project.pdfUrl || !isSubmittedForReview || isProcessingAction} onClick={handleApprove}>
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}Approve
              </Button>
              <Button variant="accent" disabled={!project.projectTitle || !project.pdfUrl || !isSubmittedForReview || isProcessingAction} onClick={() => onAction(project, 'Changes Requested')}>
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}Request Changes
              </Button>
              <Button variant="danger" disabled={!project.projectTitle || !project.pdfUrl || !isSubmittedForReview || isProcessingAction} onClick={() => onAction(project, 'Rejected')}>
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <UserMinus size={16} />}Reject
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose}>Close</Button>
          )
        ) : null
      }
    >
      {project && isApprovalFormOpen ? (
        <form
          id="project-approval-rating-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (completeRatings) {
              onAction(project, 'Approved', {
                ratings: completeRatings,
                remarks: approvalRemarks,
                reviewRatingRound: reviewRatingRound || undefined,
                isReviewEdit: !!reviewRatingRound,
              });
            }
          }}
        >
          <div className="mb-4 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleOpenDocument}
              disabled={!selectedPdfKey || isOpeningDocument || isProcessingAction}
              title={selectedPdfKey ? 'Open the document this rating was written about.' : 'No saved document is available for this rating.'}
            >
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
          />
        </form>
      ) : project ? (
        <div className="space-y-6">
          <div className="mb-2">
            <div
              aria-label="Project workspace view"
              className={`grid gap-2 ${hasManagement ? 'grid-cols-3' : 'grid-cols-2'}`}
            >
              {viewTabs.map((view) => {
                const isSelected = activeView === view;
                const label = view.charAt(0).toUpperCase() + view.slice(1);

                return (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setDialogView(view)}
                    disabled={!hasManagement && view === 'team'}
                    className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                      isSelected
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeView === 'actions' && (
            <div className="grid gap-4">
              <DashboardPanel>
                <SectionHeader title="Project identity" description="The team and submission details for this project." />
                <div className="flex items-start gap-3">
                  <AvatarBadge name={getMemberNames(project)} className="h-12 w-12" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Project</p>
                    <h3 className="mt-2 text-lg font-bold leading-7 text-[var(--color-text)]">{project.projectTitle || 'Project details not submitted yet.'}</h3>
                    <p className="mt-2 text-sm font-semibold text-[var(--color-text-muted)]">{getMemberNames(project)}</p>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">{getMemberRollNumbers(project)}</p>
                    <p className="mt-3 inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-bold text-[var(--color-text)]">
                      {getProgramName(getProjectProgram(project))}
                    </p>
                  </div>
                </div>
              </DashboardPanel>
            </div>
          )}

          {activeView === 'details' && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Status</p>
                  <div className="mt-2"><Badge variant={getStatusVariant(project.status)}>{getStatusLabel(project.status)}</Badge></div>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Batch</p>
                  <p className="mt-2 text-sm font-bold text-[var(--color-text)]">{project.batch || 'Not assigned'}</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Semester</p>
                  <p className="mt-2 text-sm font-bold text-[var(--color-text)]">{project.semester || 'Not assigned'}</p>
                </div>
              </div>

              <Timeline currentStage={project.stage || 'PROPOSAL'} descriptionSuffix="based on the current project stage." />

              <DashboardPanel>
                <SectionHeader
                  title="Project Details"
                  description="Submitted project information from the team."
                  action={selectedPdfKey ? <a href={`/api/read-pdf?url=${encodeURIComponent(selectedPdfKey)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"><ExternalLink size={16} />View PDF</a> : null}
                />
                {project.projectTitle ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Title</p>
                      <h3 className="mt-2 text-lg font-bold leading-7 text-[var(--color-text)]">{project.projectTitle}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {domainLabels.map((domainLabel) => <Badge key={domainLabel} variant="accent"><Globe size={13} />{domainLabel}</Badge>)}
                      {project.tools && <Badge variant="muted"><Wrench size={13} />{project.tools}</Badge>}
                    </div>
                    <p className="text-sm leading-6 text-[var(--color-text-muted)]">{project.projectDesc || 'No project description provided.'}</p>
                  </div>
                ) : (
                  <EmptyState title="Project details not submitted" description="This team has not submitted its title, description, tools, and PDF yet." icon={<FileText size={28} />} />
                )}
              </DashboardPanel>

              <DashboardPanel>
                <SectionHeader title="Project Ratings" description="Permanent ratings recorded when earlier stages were approved." />
                <ProjectRatingsDisplay
                  ratings={project.ratings}
                  stage={project.stage || 'PROPOSAL'}
                  onReviewRating={handleReviewRating}
                />
                {project.stage === 'PROPOSAL' ? (
                  <p className="text-sm text-[var(--color-text-muted)]">Ratings appear after a stage is approved.</p>
                ) : null}
              </DashboardPanel>
            </div>
          )}

          {activeView === 'team' && management && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Members</p>
                  <p className="mt-2 text-sm font-bold text-[var(--color-text)]">{project.members?.length || 0} students</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Capacity</p>
                  <p className="mt-2 text-sm font-bold text-[var(--color-text)]">{getTeamCapacity(project.maxTeamSize)} students</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Status</p>
                  <p className="mt-2 text-sm font-bold text-[var(--color-text)]">
                    {getTeamCapacity(project.maxTeamSize) === EXPANDED_TEAM_SIZE ? 'Three-member team approved' : 'Standard team size'}
                  </p>
                </div>
              </div>

              <DashboardPanel>
                <SectionHeader title="Team Members" description="Students currently attached to this project." />
                <div className="grid gap-3 md:grid-cols-2">
                  {(project.members || []).map((member) => (
                    <div key={member._id || member.rollNo || member.email} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                      <AvatarBadge name={member.name} />
                      <div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--color-text)]">{member.name || 'Student'}</p><p className="truncate text-xs text-[var(--color-text-muted)]">{member.rollNo || member.email || 'No identifier'}</p></div>
                    </div>
                  ))}
                </div>
              </DashboardPanel>

              <DashboardPanel>
                <SectionHeader title="Supervisor Management" description="Select a student from the team and migrate them individually." />
                <div className="grid gap-4">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Select Student to Migrate</label>
                    <select value={management.migrationStudentId} onChange={(event) => management.onMigrationStudentChange(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]">
                      {(project.members || []).map((member) => <option key={member._id} value={member._id}>{member.name} ({member.rollNo || member.email})</option>)}
                    </select>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                    <StyledInput value={management.migrationCode} onChange={(event) => management.onMigrationCodeChange(event.target.value.toUpperCase())} placeholder="Enter target migration code" />
                    <Button variant="outline" disabled={isProcessingAction || !management.migrationStudentId} onClick={management.onMigrate}>
                      {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <ArrowRightLeft size={16} />}Migrate Student
                    </Button>
                    {getTeamCapacity(project.maxTeamSize) < EXPANDED_TEAM_SIZE && <Button variant="outline" disabled={isProcessingAction} onClick={management.onExpandTeam}><Users size={16} />Allow 3 Members</Button>}
                    <Button variant="danger" disabled={isProcessingAction} onClick={management.onRemoveTeam}><UserMinus size={16} />Remove Team</Button>
                  </div>
                </div>
              </DashboardPanel>
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
