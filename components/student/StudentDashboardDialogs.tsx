import { AlertCircle, CheckCircle, Copy, Loader2 } from 'lucide-react';
import { PROGRAM_MAP } from '../../config/appSettings';
import { Button, Dialog } from '../ui/SharedUI';
import type { AcademicForm, SupervisorOption, WordTemplate } from './studentDashboardTypes';

const getProgramName = (program: string) =>
  (PROGRAM_MAP as Record<string, string>)[program] || program;

export function SupervisorChangeDialog({
  open,
  onClose,
  isSubmitting,
  onConfirm,
  selectedSupervisorId,
  onSelectedSupervisorIdChange,
  options,
  selectedSupervisorName,
  isDarkMode,
}: {
  open: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  onConfirm: () => void;
  selectedSupervisorId: string;
  onSelectedSupervisorIdChange: (value: string) => void;
  options: SupervisorOption[];
  selectedSupervisorName: string;
  isDarkMode: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change Supervisor"
      description="Select a new available supervisor and review what will happen before confirming."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            disabled={isSubmitting || !selectedSupervisorId}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <AlertCircle size={16} />}
            Confirm Change
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            New Supervisor
          </label>
          <select
            value={selectedSupervisorId}
            onChange={(event) => onSelectedSupervisorIdChange(event.target.value)}
            disabled={isSubmitting}
            className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="">Select a new supervisor</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {selectedSupervisorId && (
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              You selected <strong className="text-[var(--color-text)]">{selectedSupervisorName}</strong>.
            </p>
          )}
        </div>

        <div
          className={`overflow-hidden rounded-lg border ${
            isDarkMode ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-start gap-3 p-4">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                isDarkMode ? 'bg-red-500/15' : 'bg-red-100'
              }`}
            >
              <AlertCircle size={19} className={isDarkMode ? 'text-red-300' : 'text-red-600'} />
            </div>

            <div>
              <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-black'}`}>
                Your current workspace will be reset
              </p>
              <p className={`mt-1 text-sm leading-5 ${isDarkMode ? 'text-white/70' : 'text-slate-600'}`}>
                This action affects your project data and team membership.
              </p>
            </div>
          </div>

          <div className={`border-t px-4 ${isDarkMode ? 'border-white/10' : 'border-red-200'}`}>
            {[
              'Your uploaded project details, files, and voice notes will be deleted.',
              'If you are in a team, you will leave it. Your teammate will keep the existing project.',
              'You will start with a new workspace under the selected supervisor.',
              'This change cannot be undone from your dashboard.',
            ].map((message) => (
              <div
                key={message}
                className={`flex gap-3 border-b py-3 last:border-b-0 ${
                  isDarkMode ? 'border-white/10' : 'border-red-200'
                }`}
              >
                <span
                  className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                    isDarkMode ? 'bg-red-300' : 'bg-red-500'
                  }`}
                />
                <p className={`text-sm leading-6 ${isDarkMode ? 'text-white' : 'text-black'}`}>
                  {message}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export function AcademicUpdateDialog({
  open,
  onClose,
  isWarningStep,
  onBack,
  onContinue,
  isUpdating,
  onConfirm,
  academicForm,
  onAcademicFormChange,
  batchOptions,
}: {
  open: boolean;
  onClose: () => void;
  isWarningStep: boolean;
  onBack: () => void;
  onContinue: () => void;
  isUpdating: boolean;
  onConfirm: () => void;
  academicForm: AcademicForm;
  onAcademicFormChange: (form: AcademicForm) => void;
  batchOptions: string[];
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isWarningStep ? 'Confirm academic reset' : 'Update academic information'}
      description={
        isWarningStep
          ? 'Changing program or batch resets your project workspace and removes current team/supervisor assignment.'
          : 'Select your correct program and batch. You will review the warning before saving.'
      }
      footer={
        isWarningStep ? (
          <>
            <Button variant="outline" onClick={onBack} disabled={isUpdating}>
              Back
            </Button>
            <Button variant="danger" onClick={onConfirm} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="animate-spin" size={16} /> : <AlertCircle size={16} />}
              Confirm Reset
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onContinue}>Continue</Button>
          </>
        )
      }
    >
      {isWarningStep ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
          <p className="text-sm font-bold text-red-700 dark:text-red-300">
            This action will reset the student workspace.
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">
            Project title, description, domains, tools, PDF, supervisor assignment, and team
            membership can be cleared by this update.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Program</label>
            <select
              value={academicForm.program}
              onChange={(event) => onAcademicFormChange({ ...academicForm, program: event.target.value })}
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            >
              {Object.keys(PROGRAM_MAP).map((program) => (
                <option key={program} value={program}>{getProgramName(program)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Batch</label>
            <select
              value={academicForm.batch}
              onChange={(event) => onAcademicFormChange({ ...academicForm, batch: event.target.value })}
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Select batch</option>
              {batchOptions.map((batch) => <option key={batch} value={batch}>{batch}</option>)}
            </select>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function TemplatePreviewDialog({
  selectedTemplate,
  onClose,
  isCopyingTemplate,
  isCopied,
  onCopy,
}: {
  selectedTemplate: WordTemplate | null;
  onClose: () => void;
  isCopyingTemplate: boolean;
  isCopied: boolean;
  onCopy: () => void;
}) {
  return (
    <Dialog
      open={!!selectedTemplate}
      onClose={onClose}
      title={selectedTemplate?.title || 'Template'}
      description="Word preview · editable after pasting"
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isCopyingTemplate}>Close</Button>
          <Button onClick={onCopy} disabled={isCopyingTemplate}>
            {isCopyingTemplate ? (
              <Loader2 className="animate-spin" size={16} />
            ) : isCopied ? (
              <CheckCircle size={16} />
            ) : (
              <Copy size={16} />
            )}
            {isCopyingTemplate ? 'Copying' : isCopied ? 'Copied for Word' : 'Copy for Word'}
          </Button>
        </>
      }
    >
      <div className="portal-scrollbar max-h-[68vh] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 sm:p-5">
        <div
          role="document"
          aria-label={`${selectedTemplate?.title || 'Template'} Word preview`}
          className="mx-auto min-h-[720px] w-full max-w-[816px] bg-white px-6 py-10 text-black shadow-sm sm:px-10 md:px-16"
          // Trusted, allowlisted static HTML from word_templates/. Never use this for user HTML.
          dangerouslySetInnerHTML={{ __html: selectedTemplate?.content || '' }}
        />
      </div>
    </Dialog>
  );
}
