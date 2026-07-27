import type { ChangeEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

import { PROGRAM_MAP } from '../../../config/appSettings';
import { Button, Dialog } from '../../ui/SharedUI';
import type { AcademicForm } from '../studentDashboardTypes';

export type AcademicUpdateDialogProps = {
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
};

const getProgramName = (program: string) =>
  (PROGRAM_MAP as Record<string, string>)[program] || program;

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
}: AcademicUpdateDialogProps) {
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
              {isUpdating ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              Confirm Reset
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
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
            <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
              Program
            </label>
            <select
              value={academicForm.program}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onAcademicFormChange({ ...academicForm, program: event.target.value })
              }
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            >
              {Object.keys(PROGRAM_MAP).map((program) => (
                <option key={program} value={program}>
                  {getProgramName(program)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
              Batch
            </label>
            <select
              value={academicForm.batch}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onAcademicFormChange({ ...academicForm, batch: event.target.value })
              }
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Select batch</option>
              {batchOptions.map((batch) => (
                <option key={batch} value={batch}>
                  {batch}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Dialog>
  );
}
