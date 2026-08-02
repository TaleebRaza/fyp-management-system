import type { ChangeEvent } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

import { Button, Dialog } from '../../ui';
import type { SupervisorOption } from '../studentDashboardTypes';

export type SupervisorChangeDialogProps = {
  open: boolean;
  onClose: () => void;
  isSubmitting: boolean;
  onConfirm: () => void;
  selectedSupervisorId: string;
  onSelectedSupervisorIdChange: (value: string) => void;
  options: SupervisorOption[];
  selectedSupervisorName: string;
  isDarkMode: boolean;
};

const RESET_WARNINGS = [
  'Your uploaded project details, files, and voice notes will be deleted.',
  'If you are in a team, you will leave it. Your teammate will keep the existing project.',
  'You will start with a new workspace under the selected supervisor.',
  'This change cannot be undone from your dashboard.',
] as const;

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
}: SupervisorChangeDialogProps) {
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
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
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
            onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectedSupervisorIdChange(event.target.value)}
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
              You selected{' '}
              <strong className="text-[var(--color-text)]">{selectedSupervisorName}</strong>.
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
              <AlertCircle
                size={19}
                className={isDarkMode ? 'text-red-300' : 'text-red-600'}
              />
            </div>
            <div>
              <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-black'}`}>
                Your current workspace will be reset
              </p>
              <p
                className={`mt-1 text-sm leading-5 ${
                  isDarkMode ? 'text-white/70' : 'text-slate-600'
                }`}
              >
                This action affects your project data and team membership.
              </p>
            </div>
          </div>
          <div
            className={`border-t px-4 ${isDarkMode ? 'border-white/10' : 'border-red-200'}`}
          >
            {RESET_WARNINGS.map((message) => (
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
