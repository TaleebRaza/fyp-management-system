import { PROGRAM_MAP } from '../../../config/appSettings';
import {
  formatProjectDomainLabels,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../config/projectDomains';
import { getTeamCapacity } from '../../../config/appSettings';
import type {
  AnnouncementItem,
  StudentDashboardData,
} from '../studentDashboardTypes';
import { getStudentFineRestrictionState } from '../workflows/studentFineRestriction';

export function getStudentProgramName(program?: string): string {
  if (!program) return 'No program';
  return (PROGRAM_MAP as Record<string, string>)[program] || program;
}

export function getStudentSecureMediaUrl(url?: string): string {
  if (!url) return '';
  const key = url.includes('.com/') ? url.split('.com/')[1] : url.replace(/^\//, '');
  return key ? `/api/read-pdf?url=${encodeURIComponent(key)}` : '';
}

export function splitStudentTools(tools?: string): string[] {
  return String(tools || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getStudentAnnouncementItems(
  data: StudentDashboardData | null,
  headline: string
): AnnouncementItem[] {
  const items: AnnouncementItem[] = [];
  const supervisorBroadcast = data?.supervisorBroadcast || null;

  if (headline.trim()) {
    items.push({
      id: 'admin-announcement',
      source: 'Admin',
      title: 'Admin Announcement',
      type: 'text',
      content: headline.trim(),
      tone: 'admin',
    });
  }

  if (supervisorBroadcast?.type && supervisorBroadcast?.content) {
    items.push({
      id: 'supervisor-broadcast',
      source: supervisorBroadcast.supervisorName || data?.supervisor?.name || 'Supervisor',
      title:
        supervisorBroadcast.type === 'audio'
          ? 'Supervisor Voice Broadcast'
          : 'Supervisor Broadcast',
      type: supervisorBroadcast.type,
      content: supervisorBroadcast.content,
      tone: 'supervisor',
      createdAt: supervisorBroadcast.createdAt,
    });
  }

  return items;
}

export function buildStudentDashboardViewModel(
  data: StudentDashboardData | null,
  headline: string,
  draftTools: string
) {
  const me = data?.student;
  const supervisor = data?.supervisor;
  const project = data?.project;
  const fineState = getStudentFineRestrictionState(data);
  const projectMembers = Array.isArray(project?.members) ? project.members : [];
  const maxTeamSize = getTeamCapacity(project?.maxTeamSize);
  const currentStage = project?.stage || 'PROPOSAL';
  const savedDomainIds = normalizeProjectDomainIds(
    Array.isArray(project?.domains) && project.domains.length > 0
      ? project.domains
      : me?.domains,
    project?.domain || me?.domain
  );
  const isUnassigned = !me?.supervisorId || me?.status === 'Unassigned';
  const canSubmitByStatus = ['Pending', 'Rejected', 'Changes Requested'].includes(
    me?.status || ''
  );
  const projectSubmissionsOpen =
    data?.projectSubmissionsOpen !== false || Number(project?.version || 0) > 0;

  return {
    me,
    supervisor,
    project,
    ...fineState,
    projectMembers,
    maxTeamSize,
    canShareInviteCode:
      Boolean(project?.inviteCode) && projectMembers.length < maxTeamSize,
    canLeaveTeam: projectMembers.length > 1,
    currentStage,
    currentProgramName: getStudentProgramName(me?.program),
    toolsList: splitStudentTools(me?.tools || draftTools),
    savedDomainLabels: getProjectDomainLabels(savedDomainIds),
    savedDomainText: formatProjectDomainLabels(
      savedDomainIds,
      project?.domain || me?.domain
    ),
    pdfUrl: me?.pdfUrl || project?.pdfUrl,
    isUnassigned,
    canSubmitByStatus,
    projectSubmissionsOpen,
    canSubmit: canSubmitByStatus && projectSubmissionsOpen && !fineState.isFineRestricted,
    isSupervisorChangeLocked:
      !isUnassigned &&
      (project?.status === 'Approved' || currentStage !== 'PROPOSAL'),
    announcementItems: getStudentAnnouncementItems(data, headline),
  };
}
