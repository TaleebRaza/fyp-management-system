import type { FormEventHandler } from 'react';
import { ArrowRight, Copy, Loader2, Lock, LogOut, RotateCcw, UserCheck, Users } from 'lucide-react';
import { AvatarBadge, Button, StyledInput } from '../ui';
import { EXPANDED_TEAM_SIZE } from '../../config/appSettings';
import type { ProjectMember, SupervisorOption } from './studentDashboardTypes';

export default function StudentTeamSection({
  projectMembers,
  maxTeamSize,
  canShareInviteCode,
  inviteCode,
  isUnassigned,
  supervisorName,
  supervisorOptions,
  selectedSupervisorId,
  onSupervisorChange,
  isSubmitting,
  onAssignSupervisor,
  inviteCodeInput,
  onInviteCodeChange,
  onJoinTeam,
  canLeaveTeam,
  onLeaveTeam,
  onResetProject,
  onCopyInviteCode,
  onOpenSupervisorChange,
  isSupervisorChangeLocked,
  supervisorChangeOptions,
}: {
  projectMembers: ProjectMember[];
  maxTeamSize: number;
  canShareInviteCode: boolean;
  inviteCode?: string;
  isUnassigned: boolean;
  supervisorName?: string;
  supervisorOptions: SupervisorOption[];
  selectedSupervisorId: string;
  onSupervisorChange: (value: string) => void;
  isSubmitting: boolean;
  onAssignSupervisor: FormEventHandler<HTMLFormElement>;
  inviteCodeInput: string;
  onInviteCodeChange: (value: string) => void;
  onJoinTeam: FormEventHandler<HTMLFormElement>;
  canLeaveTeam: boolean;
  onLeaveTeam: () => void;
  onResetProject: () => void;
  onCopyInviteCode: () => void;
  onOpenSupervisorChange: () => void;
  isSupervisorChangeLocked: boolean;
  supervisorChangeOptions: SupervisorOption[];
}) {
  return (
    <div className="portal-bento">
      <section className="portal-bento-tile p-5 md:col-span-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="portal-eyebrow">Team</p>
            <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">{projectMembers.length} of {maxTeamSize} members</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
              {maxTeamSize === EXPANDED_TEAM_SIZE ? 'Your supervisor approved a three-member team.' : 'FYP teams normally contain up to two students.'}
            </p>
          </div>
          <Users size={20} className="text-[var(--color-text-soft)]" />
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {projectMembers.length > 0 ? projectMembers.map((member) => (
            <div key={member._id} className="flex items-center gap-3 rounded-xl bg-[var(--color-surface-muted)] p-3">
              <AvatarBadge name={member.name} className="h-9 w-9 rounded-lg text-xs" />
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[var(--color-text)]">{member.name}</p>
                <p className="truncate text-xs text-[var(--color-text-muted)]">{member.rollNo || member.email || 'Team member'}</p>
              </div>
            </div>
          )) : <div className="rounded-xl border border-dashed border-[var(--color-border)] p-5 text-center text-sm text-[var(--color-text-muted)] sm:col-span-2">No team members found.</div>}
        </div>

        {canShareInviteCode && inviteCode ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
            <div>
              <p className="portal-eyebrow">Invite code</p>
              <p className="mt-1 font-mono text-lg font-black tracking-[0.14em] text-[var(--color-text)]">{inviteCode}</p>
            </div>
            <Button variant="outline" onClick={onCopyInviteCode}><Copy size={15} />Copy</Button>
          </div>
        ) : null}
      </section>

      <section className="portal-bento-tile portal-bento-soft p-5 md:col-span-5">
        <p className="portal-eyebrow">Supervisor</p>
        {isUnassigned ? (
          <form onSubmit={onAssignSupervisor} className="mt-3 space-y-3">
            <div>
              <label className="mb-2 block text-xs font-extrabold text-[var(--color-text)]">Available supervisors</label>
              <select value={selectedSupervisorId} onChange={(event) => onSupervisorChange(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]">
                <option value="">Select supervisor</option>
                {supervisorOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
            <Button type="submit" disabled={isSubmitting || supervisorOptions.length === 0} className="w-full">
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <UserCheck size={16} />}Confirm assignment
            </Button>
          </form>
        ) : (
          <>
            <p className="mt-2 text-sm font-extrabold text-[var(--color-text)]">{supervisorName || 'Supervisor assigned'}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">Changing supervisor is available only while the project policy permits it.</p>
            <Button type="button" variant="outline" className="mt-4 w-full" onClick={onOpenSupervisorChange} disabled={isSubmitting || isSupervisorChangeLocked || supervisorChangeOptions.length === 0}>
              {isSupervisorChangeLocked ? <Lock size={16} /> : <UserCheck size={16} />}Change supervisor
            </Button>
            {isSupervisorChangeLocked && <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">Supervisor changes are locked after proposal approval or once the project moves beyond the proposal stage.</p>}
            {!isSupervisorChangeLocked && supervisorChangeOptions.length === 0 && <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">No other supervisor currently has an available slot.</p>}
          </>
        )}
      </section>

      <section className="portal-bento-tile p-5 md:col-span-6">
        <p className="portal-eyebrow">Join another team</p>
        <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">Have an invite code?</h2>
        <form onSubmit={onJoinTeam} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <StyledInput value={inviteCodeInput} onChange={(event) => onInviteCodeChange(event.target.value.toUpperCase())} placeholder="Enter invite code" />
          <Button type="submit" variant="outline" disabled={isSubmitting} className="shrink-0"><ArrowRight size={16} />Join team</Button>
        </form>
      </section>

      <section className="portal-bento-tile p-5 md:col-span-6">
        <p className="portal-eyebrow">Advanced team changes</p>
        <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">Use only when the project setup must change</h2>
        <details className="portal-disclosure mt-4">
          <summary>Show advanced actions</summary>
          <div className="space-y-3">
            <Button type="button" variant="danger" className="w-full" onClick={onResetProject} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}Reset project</Button>
            <Button type="button" variant="outline" className="w-full" onClick={onLeaveTeam} disabled={isSubmitting || !canLeaveTeam}>{isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}Leave team</Button>
            <p className="text-xs leading-5 text-[var(--color-text-muted)]">Reset Project returns the team to Proposal and deletes its current document and ratings while keeping the team and supervisor. Leaving the team is unavailable when you are the only member.</p>
          </div>
        </details>
      </section>
    </div>
  );
}
