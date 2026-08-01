import type { FormEventHandler } from 'react';
import { CircleDollarSign, ExternalLink, Loader2, Lock, Upload, Wrench } from 'lucide-react';
import {
  Button,
  DashboardPanel,
  SectionHeader,
  StyledInput,
  TextArea,
} from '../ui/SharedUI';
import ProjectDomainSelector from './ProjectDomainSelector';
import { PROJECT_SUBMISSIONS_CLOSED_MESSAGE } from '../../lib/projectSubmissionPolicy';

export default function StudentProjectSubmissionSection({
  pdfUrl,
  pdfHref,
  isFineRestricted,
  teamFineMessage,
  isOwnFineRestricted,
  onOpenFine,
  projectSubmissionsOpen,
  canSubmitByStatus,
  status,
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
  canSubmit,
  file,
  onFileChange,
  isSubmitting,
}: {
  pdfUrl?: string;
  pdfHref: string;
  isFineRestricted: boolean;
  teamFineMessage: string;
  isOwnFineRestricted: boolean;
  onOpenFine: () => void;
  projectSubmissionsOpen: boolean;
  canSubmitByStatus: boolean;
  status?: string;
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
  canSubmit: boolean;
  file: File | null;
  onFileChange: (file: File | null) => void;
  isSubmitting: boolean;
}) {
  return (
    <DashboardPanel>
      <SectionHeader
        title="Project Submission"
        description="Update your project details and submit the required PDF for supervisor review."
        action={
          pdfUrl ? (
            <a
              href={pdfHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              <ExternalLink size={16} />
              View PDF
            </a>
          ) : null
        }
      />

      {isFineRestricted && (
        <div className="mb-5 rounded-xl border border-red-300 bg-red-100/70 p-4 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-semibold">{teamFineMessage}</p>
            {isOwnFineRestricted && (
              <Button type="button" variant="outline" onClick={onOpenFine}>
                <CircleDollarSign size={16} />
                View Fine Details
              </Button>
            )}
          </div>
        </div>
      )}

      {!projectSubmissionsOpen && (
        <div className="mb-5 rounded-xl border border-red-300 bg-red-100/70 p-4 text-sm text-red-950 dark:border-red-800 dark:bg-red-950/50 dark:text-red-50">
          <div className="flex items-start gap-3">
            <Lock size={18} className="mt-0.5 shrink-0" />
            <p className="font-semibold">{PROJECT_SUBMISSIONS_CLOSED_MESSAGE}</p>
          </div>
        </div>
      )}

      {!canSubmitByStatus && (
        <div className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <div className="flex items-start gap-3">
            <Lock size={18} className="mt-0.5 text-[var(--color-text-muted)]" />
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Submissions are closed while your project status is{' '}
              <strong className="text-[var(--color-text)]">{status}</strong>.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Project Title
          </label>
          <StyledInput
            value={title}
            disabled={!canSubmit}
            onChange={(event) => onTitleChange(event.target.value)}
            required
            placeholder="Enter project title"
          />
        </div>

        <ProjectDomainSelector
          selectedDomains={selectedDomains}
          legacyDomain={legacyDomain}
          disabled={!canSubmit}
          onChange={onDomainsChange}
        />

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Tools and Technologies
          </label>
          <StyledInput
            icon={Wrench}
            value={tools}
            disabled={!canSubmit}
            onChange={(event) => onToolsChange(event.target.value)}
            required
            placeholder="e.g. React, Python, TensorFlow"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Description
          </label>
          <TextArea
            value={description}
            disabled={!canSubmit}
            onChange={(event) => onDescriptionChange(event.target.value)}
            required
            placeholder="Describe your project scope, goals, and expected outcome..."
          />
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Project PDF
          </label>
          <input
            type="file"
            accept="application/pdf"
            disabled={!canSubmit}
            onChange={(event) => onFileChange(event.target.files?.[0] || null)}
            className="block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
            PDF only. Maximum size 4MB.{' '}
            {file
              ? `Selected: ${file.name}`
              : pdfUrl
                ? 'Existing PDF will be reused if you do not select a new file.'
                : 'A PDF is required for first submission.'}
          </p>
        </div>

        <Button type="submit" disabled={isSubmitting || !canSubmit} className="w-full sm:w-auto">
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
          {isSubmitting ? 'Submitting...' : 'Submit For Review'}
        </Button>
      </form>
    </DashboardPanel>
  );
}
