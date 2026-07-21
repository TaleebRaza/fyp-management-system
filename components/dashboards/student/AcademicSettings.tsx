import { AlertCircle, Loader2, Settings } from 'lucide-react';
import type { ChangeEventHandler } from 'react';

import { Button, DashboardPanel, Dialog, SectionHeader } from '../../ui/SharedUI';

type AcademicOption = { value: string; label: string };

type AcademicSettingsPanelProps = {
  programName: string;
  batch?: string;
  onOpen: () => void;
};

export function AcademicSettingsPanel({ programName, batch, onOpen }: AcademicSettingsPanelProps) {
  return (
    <DashboardPanel>
      <SectionHeader title="Academic Settings" description="Program and batch are reset-sensitive fields." />
      <div className="space-y-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Program</p><p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{programName}</p></div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Batch</p><p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{batch || 'No batch'}</p></div>
        <Button variant="outline" className="w-full" onClick={onOpen}><Settings size={16} />Update Program / Batch</Button>
      </div>
    </DashboardPanel>
  );
}

type AcademicSettingsDialogProps = {
  open: boolean;
  isWarningStep: boolean;
  isUpdating: boolean;
  form: { program: string; batch: string };
  programOptions: AcademicOption[];
  batchOptions: AcademicOption[];
  onClose: () => void;
  onProgramChange: ChangeEventHandler<HTMLSelectElement>;
  onBatchChange: ChangeEventHandler<HTMLSelectElement>;
  onContinue: () => void;
  onBack: () => void;
  onConfirm: () => void;
};

export function AcademicSettingsDialog({
  open,
  isWarningStep,
  isUpdating,
  form,
  programOptions,
  batchOptions,
  onClose,
  onProgramChange,
  onBatchChange,
  onContinue,
  onBack,
  onConfirm,
}: AcademicSettingsDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isWarningStep ? 'Confirm academic reset' : 'Update academic information'}
      description={isWarningStep ? 'Changing program or batch resets your project workspace and removes current team/supervisor assignment.' : 'Select your correct program and batch. You will review the warning before saving.'}
      footer={isWarningStep ? <><Button variant="outline" onClick={onBack} disabled={isUpdating}>Back</Button><Button variant="danger" onClick={onConfirm} disabled={isUpdating}>{isUpdating ? <Loader2 className="animate-spin" size={16} /> : <AlertCircle size={16} />}Confirm Reset</Button></> : <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onContinue}>Continue</Button></>}
    >
      {isWarningStep ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20"><p className="text-sm font-bold text-red-700 dark:text-red-300">This action will reset the student workspace.</p><p className="mt-2 text-sm leading-6 text-[var(--color-text)]">Project title, description, domains, tools, PDF, supervisor assignment, and team membership can be cleared by this update.</p></div>
      ) : (
        <div className="space-y-4">
          <div><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Program</label><select value={form.program} onChange={onProgramChange} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]">{programOptions.map((program) => <option key={program.value} value={program.value}>{program.label}</option>)}</select></div>
          <div><label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Batch</label><select value={form.batch} onChange={onBatchChange} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"><option value="">Select batch</option>{batchOptions.map((batch) => <option key={batch.value} value={batch.value}>{batch.label}</option>)}</select></div>
        </div>
      )}
    </Dialog>
  );
}
