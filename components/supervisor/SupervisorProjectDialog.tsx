import { ArrowRightLeft, CheckCircle, ExternalLink, FileText, Globe, Loader2, UserMinus, Users, Wrench } from 'lucide-react';
import { EXPANDED_TEAM_SIZE, getTeamCapacity } from '../../config/appSettings';
import { AvatarBadge, Badge, Button, DashboardPanel, Dialog, EmptyState, SectionHeader, StyledInput } from '../ui';
import { Timeline } from '../ui/Timeline';
import { VoiceChat } from '../ui/VoiceChat';
import {
  getMemberNames,
  getMemberRollNumbers,
  getProgramName,
  getProjectDomainDisplayLabels,
  getProjectProgram,
  getSafePdfKey,
  getStatusVariant,
} from './SupervisorProjectCard';
import type { SupervisorProject, SupervisorTheme } from './supervisorDashboardTypes';

type VoiceNotes = {
  currentUserId: string;
  theme: SupervisorTheme;
  isDarkMode: boolean;
};

type ProjectManagement = {
  migrationStudentId: string;
  onMigrationStudentChange: (studentId: string) => void;
  migrationCode: string;
  onMigrationCodeChange: (value: string) => void;
  onMigrate: () => void;
  onExpandTeam: () => void;
  onRemoveTeam: () => void;
};

export default function SupervisorProjectDialog({
  project,
  onClose,
  isProcessingAction,
  onAction,
  voiceNotes,
  management,
}: {
  project: SupervisorProject | null;
  onClose: () => void;
  isProcessingAction: boolean;
  onAction: (studentId: string, status: string) => void;
  voiceNotes?: VoiceNotes;
  management?: ProjectManagement;
}) {
  const selectedPdfKey = getSafePdfKey(project?.pdfUrl);
  const domainLabels = getProjectDomainDisplayLabels(project);

  return (
    <Dialog
      open={!!project}
      onClose={onClose}
      title={getMemberNames(project)}
      description={project ? `${getMemberRollNumbers(project)} · ${getProgramName(getProjectProgram(project))} · ${project.batch || 'No batch'} · ${project.semester || 'No semester'}${project.supervisorName ? ` · Supervisor: ${project.supervisorName}` : ''}` : ''}
      size="xl"
      footer={
        project ? (
          <>
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button variant="success" disabled={!project.projectTitle || !project.pdfUrl || project.status === 'Approved' || isProcessingAction} onClick={() => onAction(project.triggerStudentId, 'Approved')}>
              {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}Approve
            </Button>
            <Button variant="accent" disabled={!project.projectTitle || !project.pdfUrl || project.status === 'Changes Requested' || isProcessingAction} onClick={() => onAction(project.triggerStudentId, 'Changes Requested')}>
              {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}Request Changes
            </Button>
            <Button variant="danger" disabled={!project.projectTitle || !project.pdfUrl || project.status === 'Rejected' || isProcessingAction} onClick={() => onAction(project.triggerStudentId, 'Rejected')}>
              {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <UserMinus size={16} />}Reject
            </Button>
          </>
        ) : null
      }
    >
      {project && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Status</p>
              <div className="mt-2"><Badge variant={getStatusVariant(project.status)}>{project.status || 'Pending'}</Badge></div>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Batch</p>
              <p className="mt-2 text-sm font-bold text-[var(--color-text)]">{project.batch || 'Not assigned'}</p>
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Team Size</p>
              <p className="mt-2 text-sm font-bold text-[var(--color-text)]">{project.members?.length || 0}{' / '}{getTeamCapacity(project.maxTeamSize)} students</p>
              {getTeamCapacity(project.maxTeamSize) === EXPANDED_TEAM_SIZE ? <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">Three-member team approved</p> : null}
            </div>
          </div>

          <Timeline currentStage={project.stage || 'PROPOSAL'} descriptionSuffix="based on the current project stage." />

          <DashboardPanel>
            <SectionHeader
              title="Project Details"
              description="Submitted project information from the team."
              action={selectedPdfKey ? <a href={`/api/read-pdf?url=${encodeURIComponent(selectedPdfKey)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"><ExternalLink size={16} />View PDF</a> : null}
            />
            {project.projectTitle ? (
              <div className="space-y-4">
                <div><p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Title</p><h3 className="mt-2 text-lg font-bold leading-7 text-[var(--color-text)]">{project.projectTitle}</h3></div>
                <div className="flex flex-wrap gap-2">
                  {domainLabels.map((domainLabel) => <Badge key={domainLabel} variant="accent"><Globe size={13} />{domainLabel}</Badge>)}
                  {project.tools && <Badge variant="muted"><Wrench size={13} />{project.tools}</Badge>}
                </div>
                <p className="text-sm leading-6 text-[var(--color-text-muted)]">{project.projectDesc || 'No project description provided.'}</p>
              </div>
            ) : (
              <EmptyState title="Project details not submitted" description="This team has not submitted its title, description, tools, and PDF yet." icon={<FileText size={28} />} />
            )}
          </DashboardPanel>

          <DashboardPanel>
            <SectionHeader title="Team Members" description="Students currently attached to this project." />
            <div className="grid gap-3 md:grid-cols-2">
              {(project.members || []).map((member) => (
                <div key={member._id || member.rollNo || member.email} className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <AvatarBadge name={member.name} />
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--color-text)]">{member.name || 'Student'}</p><p className="truncate text-xs text-[var(--color-text-muted)]">{member.rollNo || member.email || 'No identifier'}</p></div>
                </div>
              ))}
            </div>
          </DashboardPanel>

          {voiceNotes && <DashboardPanel>
            <SectionHeader title="Voice Notes" description="Communicate with the team through short project voice notes." />
            <VoiceChat projectId={project._id} currentUserId={voiceNotes.currentUserId} theme={voiceNotes.theme} isDarkMode={voiceNotes.isDarkMode} />
          </DashboardPanel>}

          {management && <DashboardPanel>
            <SectionHeader title="Supervisor Management" description="Select a student from the team and migrate them individually." />
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Select Student to Migrate</label>
                <select value={management.migrationStudentId} onChange={(event) => management.onMigrationStudentChange(event.target.value)} className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]">
                  {(project.members || []).map((member) => <option key={member._id} value={member._id}>{member.name} ({member.rollNo || member.email})</option>)}
                </select>
              </div>
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <StyledInput value={management.migrationCode} onChange={(event) => management.onMigrationCodeChange(event.target.value.toUpperCase())} placeholder="Enter target migration code" />
                <Button variant="outline" disabled={isProcessingAction || !management.migrationStudentId} onClick={management.onMigrate}>
                  {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <ArrowRightLeft size={16} />}Migrate Student
                </Button>
                {getTeamCapacity(project.maxTeamSize) < EXPANDED_TEAM_SIZE && <Button variant="outline" disabled={isProcessingAction} onClick={management.onExpandTeam}><Users size={16} />Allow 3 Members</Button>}
                <Button variant="danger" disabled={isProcessingAction} onClick={management.onRemoveTeam}><UserMinus size={16} />Remove Team</Button>
              </div>
            </div>
          </DashboardPanel>}
        </div>
      )}
    </Dialog>
  );
}
