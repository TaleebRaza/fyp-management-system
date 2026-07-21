import { ArrowRight, Loader2, Lock, UserCheck } from 'lucide-react';
import type { ChangeEventHandler, FormEventHandler } from 'react';

import { Button, DashboardPanel, SectionHeader, StyledInput } from '../../ui/SharedUI';

export type SupervisorOption = { id: string; label: string };

type SupervisorActionsPanelProps = {
  isUnassigned: boolean;
  isSubmitting: boolean;
  isSupervisorChangeLocked: boolean;
  supervisorOptions: SupervisorOption[];
  supervisorChangeOptions: SupervisorOption[];
  selectedSupervisorId: string;
  inviteCodeInput: string;
  onSupervisorChange: ChangeEventHandler<HTMLSelectElement>;
  onInviteCodeChange: ChangeEventHandler<HTMLInputElement>;
  onAssign: FormEventHandler<HTMLFormElement>;
  onJoin: FormEventHandler<HTMLFormElement>;
  onOpenSupervisorChange: () => void;
};

export function SupervisorActionsPanel({
  isUnassigned,
  isSubmitting,
  isSupervisorChangeLocked,
  supervisorOptions,
  supervisorChangeOptions,
  selectedSupervisorId,
  inviteCodeInput,
  onSupervisorChange,
  onInviteCodeChange,
  onAssign,
  onJoin,
  onOpenSupervisorChange,
}: SupervisorActionsPanelProps) {
  return (
    <DashboardPanel>
      <SectionHeader
        title={isUnassigned ? 'Supervisor & Team Actions' : 'Team Actions'}
        description={isUnassigned ? 'Choose a supervisor or join an existing team.' : 'Manage your team or change your supervisor before proposal approval.'}
      />

      {isUnassigned && (
        <form onSubmit={onAssign} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Available Supervisors</label>
            <select value={selectedSupervisorId} onChange={onSupervisorChange} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]">
              <option value="">Select supervisor</option>
              {supervisorOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={isSubmitting || supervisorOptions.length === 0} className="w-full">
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <UserCheck size={16} />}
            Confirm Assignment
          </Button>
        </form>
      )}

      <div className={isUnassigned ? 'mt-6 border-t border-[var(--color-border)] pt-6' : ''}>
        <form onSubmit={onJoin} className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Join Existing Team</label>
            <StyledInput value={inviteCodeInput} onChange={onInviteCodeChange} placeholder="Enter invite code" />
          </div>
          <Button type="submit" variant="outline" disabled={isSubmitting} className="w-full"><ArrowRight size={16} />Join Team</Button>
        </form>
      </div>

      {!isUnassigned && (
        <div className="mt-6 border-t border-[var(--color-border)] pt-6">
          <Button type="button" variant="outline" className="w-full" onClick={onOpenSupervisorChange} disabled={isSubmitting || isSupervisorChangeLocked || supervisorChangeOptions.length === 0}>
            {isSupervisorChangeLocked ? <Lock size={16} /> : <UserCheck size={16} />}Change Supervisor
          </Button>
          {isSupervisorChangeLocked && <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">Supervisor changes are locked after proposal approval or once the project moves beyond the proposal stage.</p>}
          {!isSupervisorChangeLocked && supervisorChangeOptions.length === 0 && <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">No other supervisor currently has an available slot.</p>}
        </div>
      )}
    </DashboardPanel>
  );
}
