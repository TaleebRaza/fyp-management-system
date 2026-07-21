import { ExternalLink, Loader2, Lock, Upload, Wrench } from 'lucide-react';
import type { ChangeEventHandler, FormEventHandler } from 'react';

import { Button, DashboardPanel, SectionHeader, StyledInput, TextArea } from '../../ui/SharedUI';
import { ProjectDomainSelector } from './ProjectDomainSelector';

type ProjectSubmissionPanelProps = {
  canSubmit: boolean;
  projectStatus?: string;
  pdfHref: string;
  title: string;
  description: string;
  selectedDomains: string[];
  legacyDomain: string;
  tools: string;
  file: File | null;
  isSubmitting: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onTitleChange: ChangeEventHandler<HTMLInputElement>;
  onDescriptionChange: ChangeEventHandler<HTMLTextAreaElement>;
  onDomainsChange: (domains: string[]) => void;
  onToolsChange: ChangeEventHandler<HTMLInputElement>;
  onFileChange: ChangeEventHandler<HTMLInputElement>;
};

export function ProjectSubmissionPanel({
  canSubmit,
  projectStatus,
  pdfHref,
  title,
  description,
  selectedDomains,
  legacyDomain,
  tools,
  file,
  isSubmitting,
  onSubmit,
  onTitleChange,
  onDescriptionChange,
  onDomainsChange,
  onToolsChange,
  onFileChange,
}: ProjectSubmissionPanelProps) {
  return (
    <DashboardPanel>
      <SectionHeader
        title="Project Submission"
        description="Update your project details and submit the required PDF for supervisor review."
        action={pdfHref ? (
          <a href={pdfHref} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]">
            <ExternalLink size={16} />View PDF
          </a>
        ) : null}
      />

      {!canSubmit && (
        <div className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <div className="flex items-start gap-3">
            <Lock size={18} className="mt-0.5 text-[var(--color-text-muted)]" />
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Submissions are closed while your project status is <strong className="text-[var(--color-text)]">{projectStatus}</strong>.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Project Title</label>
          <StyledInput value={title} disabled={!canSubmit} onChange={onTitleChange} required placeholder="Enter project title" />
        </div>

        <ProjectDomainSelector selectedDomains={selectedDomains} legacyDomain={legacyDomain} disabled={!canSubmit} onChange={onDomainsChange} />

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Tools and Technologies</label>
          <StyledInput icon={Wrench} value={tools} disabled={!canSubmit} onChange={onToolsChange} required placeholder="e.g. React, Python, TensorFlow" />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Description</label>
          <TextArea value={description} disabled={!canSubmit} onChange={onDescriptionChange} required placeholder="Describe your project scope, goals, and expected outcome..." />
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Project PDF</label>
          <input type="file" accept="application/pdf" disabled={!canSubmit} onChange={onFileChange} className="block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60" />
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
            PDF only. Maximum size 4MB. {file ? `Selected: ${file.name}` : pdfHref ? 'Existing PDF will be reused if you do not select a new file.' : 'A PDF is required for first submission.'}
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
