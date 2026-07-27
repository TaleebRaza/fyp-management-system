import type { FormEventHandler } from 'react';
import { ArrowRight, Copy, Loader2, Lock, LogOut, UserCheck, Users } from 'lucide-react';
import {
  AvatarBadge,
  Button,
  DashboardPanel,
  SectionHeader,
  StyledInput,
} from '../ui/SharedUI';
import { VoiceChat } from '../ui/VoiceChat';
import { EXPANDED_TEAM_SIZE } from '../../lib/teamCapacity';
import type { ProjectMember, SupervisorOption } from './studentDashboardTypes';

const DASHBOARD_THEME = {
  name: 'Professional',
  bg: 'bg-[#14213d]',
  text: 'text-[#fca311]',
  lightBg: 'bg-[#fca311]/10',
  ring: 'focus:ring-[#fca311]',
};

export default function StudentTeamSection({
  projectMembers,
  maxTeamSize,
  canShareInviteCode,
  inviteCode,
  projectId,
  isUnassigned,
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
  onCopyInviteCode,
  onOpenSupervisorChange,
  isSupervisorChangeLocked,
  supervisorChangeOptions,
  currentUserId,
  isDarkMode,
}: {
  projectMembers: ProjectMember[];
  maxTeamSize: number;
  canShareInviteCode: boolean;
  inviteCode?: string;
  projectId?: string;
  isUnassigned: boolean;
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
  onCopyInviteCode: () => void;
  onOpenSupervisorChange: () => void;
  isSupervisorChangeLocked: boolean;
  supervisorChangeOptions: SupervisorOption[];
  currentUserId: string;
  isDarkMode: boolean;
}) {
  return (
    <div className="grid gap-7 sm:gap-6 xl:grid-cols-2">
      <DashboardPanel>
        <SectionHeader
          title="Team Members"
          description={
            projectMembers.length >= maxTeamSize
              ? `Your team is full. This team can contain a maximum of ${maxTeamSize} students.`
              : maxTeamSize === EXPANDED_TEAM_SIZE
                ? 'Your supervisor approved a 3-member team. Share the invite code with one more teammate.'
                : 'FYP teams can contain a maximum of 2 students. Share the invite code with one teammate.'
          }
          action={
            canShareInviteCode ? (
              <Button variant="outline" onClick={onCopyInviteCode}>
                <Copy size={16} />
                Copy Code
              </Button>
            ) : null
          }
        />

        <div className="space-y-3">
          {projectMembers.length > 0 ? (
            projectMembers.map((member) => (
              <div
                key={member._id}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"
              >
                <AvatarBadge name={member.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--color-text)]">{member.name}</p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {member.rollNo || member.email || 'Team member'}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 text-center">
              <Users className="mx-auto mb-3 text-[var(--color-text-muted)]" size={30} />
              <p className="text-sm font-bold text-[var(--color-text)]">No team members found</p>
            </div>
          )}
        </div>

        {canShareInviteCode ? (
          <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Team Invite Code
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-[var(--color-text)]">
              {inviteCode}
            </p>
          </div>
        ) : projectMembers.length >= maxTeamSize ? (
          <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Team Capacity
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-text)]">
              {`Team full with ${projectMembers.length} of ${maxTeamSize} students. New members cannot join.`}
            </p>
          </div>
        ) : null}
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader
          title={isUnassigned ? 'Supervisor & Team Actions' : 'Team Actions'}
          description={
            isUnassigned
              ? 'Choose a supervisor or join an existing team.'
              : 'Manage your team or change your supervisor before proposal approval.'
          }
        />

        {isUnassigned && (
          <form onSubmit={onAssignSupervisor} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Available Supervisors
              </label>
              <select
                value={selectedSupervisorId}
                onChange={(event) => onSupervisorChange(event.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Select supervisor</option>
                {supervisorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || supervisorOptions.length === 0}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <UserCheck size={16} />}
              Confirm Assignment
            </Button>
          </form>
        )}

        <div className={isUnassigned ? 'mt-6 border-t border-[var(--color-border)] pt-6' : ''}>
          <form onSubmit={onJoinTeam} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Join Existing Team
              </label>
              <StyledInput
                value={inviteCodeInput}
                onChange={(event) => onInviteCodeChange(event.target.value.toUpperCase())}
                placeholder="Enter invite code"
              />
            </div>

            <Button type="submit" variant="outline" disabled={isSubmitting} className="w-full">
              <ArrowRight size={16} />
              Join Team
            </Button>
          </form>
        </div>

        <div className="mt-6 border-t border-[var(--color-border)] pt-6">
          <Button
            type="button"
            variant="danger"
            className="w-full"
            onClick={onLeaveTeam}
            disabled={isSubmitting || !canLeaveTeam}
          >
            {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <LogOut size={16} />}
            Leave Team
          </Button>
          <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
            {canLeaveTeam
              ? 'Leaving removes your supervisor, project details, status, and PDF link. You will receive a new project and invite code.'
              : 'You cannot leave while you are the only member of this team.'}
          </p>
        </div>
        {!isUnassigned && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onOpenSupervisorChange}
              disabled={isSubmitting || isSupervisorChangeLocked || supervisorChangeOptions.length === 0}
            >
              {isSupervisorChangeLocked ? <Lock size={16} /> : <UserCheck size={16} />}
              Change Supervisor
            </Button>

            {isSupervisorChangeLocked && (
              <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                Supervisor changes are locked after proposal approval or once the project moves beyond the proposal stage.
              </p>
            )}

            {!isSupervisorChangeLocked && supervisorChangeOptions.length === 0 && (
              <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                No other supervisor currently has an available slot.
              </p>
            )}
          </div>
        )}
      </DashboardPanel>

      {projectId && (
        <div className="xl:col-span-2">
          <DashboardPanel>
            <SectionHeader title="Voice Workspace" description="Quick voice notes linked to this project." />
            <VoiceChat
              projectId={projectId}
              currentUserId={currentUserId}
              theme={DASHBOARD_THEME}
              isDarkMode={isDarkMode}
            />
          </DashboardPanel>
        </div>
      )}
    </div>
  );
}
