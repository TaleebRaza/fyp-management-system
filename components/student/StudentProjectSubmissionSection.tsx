import type { FormEventHandler } from 'react';
import { CheckCircle, CircleDollarSign, ExternalLink, FileText, Loader2, Lock, Upload, Wrench } from 'lucide-react';
import { Button, StyledInput, TextArea } from '../ui';
import { ProjectRatingsDisplay } from '../project-ratings/ProjectRatingsDisplay';
import type { ProjectRatings } from '../../config/projectRatings';
import ProjectDomainSelector from './ProjectDomainSelector';
import {
  PROJECT_COMPLETE_MESSAGE,
  PROJECT_SUBMISSION_PENDING_REVIEW_MESSAGE,
  PROJECT_SUBMISSIONS_CLOSED_MESSAGE,
} from '../../lib/projectSubmissionPolicy';

const getRatingAverage = (ratings?: ProjectRatings) => {
  const round = ratings?.thesis ? 'Thesis' : ratings?.proposal ? 'Proposal' : null;
  const snapshot = ratings?.thesis || ratings?.proposal;
  if (!round || !snapshot) return null;
  return {
    round,
    average: ((snapshot.projectIdea + snapshot.technicalMerit + snapshot.documentationQuality) / 3).toFixed(1),
  };
};

export default function StudentProjectSubmissionSection({
  pdfUrl,
  pdfHref,
  isFineRestricted,
  teamFineMessage,
  isOwnFineRestricted,
  onOpenFine,
  projectSubmissionsOpen,
  hasAssignedSupervisor,
  projectSubmissionComplete,
  projectSubmissionPendingReview,
  onSubmit,
  title,
  onTitleChange,
  selectedDomains,
  legacyDomain,
  onDomainsChange,
  tools,
  onToolsChange,
  description,
  onDescriptionChange,
  canEditProjectDetails,
  canSubmit,
  file,
  onFileChange,
  isSubmitting,
  projectRatings,
  currentStage,
}: {
  pdfUrl?: string;
  pdfHref: string;
  isFineRestricted: boolean;
  teamFineMessage: string;
  isOwnFineRestricted: boolean;
  onOpenFine: () => void;
  projectSubmissionsOpen: boolean;
  hasAssignedSupervisor: boolean;
  projectSubmissionComplete: boolean;
  projectSubmissionPendingReview: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  title: string;
  onTitleChange: (value: string) => void;
  selectedDomains: string[];
  legacyDomain: string;
  onDomainsChange: (domains: string[]) => void;
  tools: string;
  onToolsChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  canEditProjectDetails: boolean;
  canSubmit: boolean;
  file: File | null;
  onFileChange: (file: File | null) => void;
  isSubmitting: boolean;
  projectRatings?: ProjectRatings;
  currentStage: string;
}) {
  const rating = getRatingAverage(projectRatings);
  const stateMessage = !projectSubmissionsOpen
    ? PROJECT_SUBMISSIONS_CLOSED_MESSAGE
    : isFineRestricted
      ? teamFineMessage
      : projectSubmissionComplete
        ? PROJECT_COMPLETE_MESSAGE
        : projectSubmissionPendingReview
          ? PROJECT_SUBMISSION_PENDING_REVIEW_MESSAGE
          : !hasAssignedSupervisor
            ? 'Assign a supervisor before submitting your project.'
            : 'Your project workspace is ready for the next submission.';

  return (
    <div className="portal-bento">
      <section className="portal-bento-tile portal-bento-soft p-5 md:col-span-5">
        <p className="portal-eyebrow">Current submission</p>
        <div className="mt-3 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] text-[var(--color-primary)]"><FileText size={18} /></span>
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-lg font-black text-[var(--color-text)]">{title || 'Project not started'}</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{stateMessage}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {pdfUrl && <a href={pdfHref} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)]"><ExternalLink size={15} />View current PDF</a>}
          {isFineRestricted && isOwnFineRestricted && <Button type="button" variant="outline" onClick={onOpenFine}><CircleDollarSign size={15} />Fine details</Button>}
        </div>
      </section>

      <section className="portal-bento-tile portal-bento-soft p-5 md:col-span-7">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="portal-eyebrow">Latest rating</p>
            {rating ? <p className="mt-1 text-lg font-black text-[var(--color-text)]">{rating.round} · {rating.average} / 10</p> : <p className="mt-1 text-sm font-extrabold text-[var(--color-text)]">No rating recorded yet</p>}
          </div>
          <CheckCircle size={20} className={rating ? 'text-[var(--color-success)]' : 'text-[var(--color-text-soft)]'} />
        </div>
        {projectRatings && (
          <details className="portal-disclosure mt-4">
            <summary>View rating breakdown</summary>
            <div>
              <ProjectRatingsDisplay ratings={projectRatings} stage={currentStage} />
            </div>
          </details>
        )}
      </section>

      <section className="portal-bento-tile p-5 md:col-span-12">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="portal-eyebrow">Submission editor</p>
            <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">Prepare the next document</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">Edit only what is relevant for the current stage, then submit one PDF for supervisor review.</p>
          </div>
          {!canEditProjectDetails && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-bg-soft)] text-[var(--color-text-muted)]"><Lock size={16} /></span>}
        </div>

        {!canEditProjectDetails && (
          <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
            Project title, domains, tools, and description are locked. You can upload a new project document.
          </div>
        )}

        <form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label className="mb-2 block text-xs font-extrabold text-[var(--color-text)]">Project title</label>
            <StyledInput value={title} disabled={!canSubmit || !canEditProjectDetails} onChange={(event) => onTitleChange(event.target.value)} required placeholder="Enter project title" />
          </div>

          <ProjectDomainSelector selectedDomains={selectedDomains} legacyDomain={legacyDomain} disabled={!canSubmit || !canEditProjectDetails} onChange={onDomainsChange} />

          <div>
            <label className="mb-2 block text-xs font-extrabold text-[var(--color-text)]">Tools and technologies</label>
            <StyledInput icon={Wrench} value={tools} disabled={!canSubmit || !canEditProjectDetails} onChange={(event) => onToolsChange(event.target.value)} required placeholder="e.g. React, Python, TensorFlow" />
          </div>

          <div className="lg:col-span-2">
            <label className="mb-2 block text-xs font-extrabold text-[var(--color-text)]">Description</label>
            <TextArea value={description} disabled={!canSubmit || !canEditProjectDetails} onChange={(event) => onDescriptionChange(event.target.value)} required placeholder="Describe the scope, goals, and expected outcome..." />
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 lg:col-span-2">
            <label className="mb-2 block text-xs font-extrabold text-[var(--color-text)]">Project PDF</label>
            <input type="file" accept="application/pdf" disabled={!canSubmit} onChange={(event) => onFileChange(event.target.files?.[0] || null)} className="block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60" />
            <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">PDF only, maximum 4MB. {file ? `Selected: ${file.name}` : pdfUrl ? 'The current PDF is reused unless you select a new one.' : 'A PDF is required for first submission.'}</p>
          </div>

          <div className="lg:col-span-2">
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              {isSubmitting ? 'Submitting...' : 'Submit for review'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
