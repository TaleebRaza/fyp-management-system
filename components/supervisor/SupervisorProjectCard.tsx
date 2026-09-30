import { ChevronRight } from 'lucide-react';
import { PROGRAM_MAP } from '../../config/appSettings';
import {
  formatProjectDomainLabels,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../config/projectDomains';
import { Badge } from '../ui';
import { isProjectAwaitingReview } from '../../lib/projectReviewPolicy';
import type { SupervisorProject } from './supervisorDashboardTypes';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'muted';

export const getStatusVariant = (status?: string): BadgeVariant => {
  if (status === 'Approved' || status === 'Document Approved') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Changes Requested' || status === 'Pending') return 'warning';
  return 'muted';
};

export const getStatusLabel = (status?: string) =>
  status === 'Pending' ? 'No New Docs' : status || 'Pending';

const PROGRAM_ACRONYM_BY_NAME = Object.entries(PROGRAM_MAP).reduce<Record<string, string>>(
  (acronyms, [acronym, fullName]) => ({ ...acronyms, [fullName]: acronym }),
  {}
);

export const getProgramName = (program?: string) => {
  const normalizedProgram = String(program || '').trim();
  if (!normalizedProgram || normalizedProgram === 'N/A') return 'N/A';
  if ((PROGRAM_MAP as Record<string, string>)[normalizedProgram]) return normalizedProgram;
  return PROGRAM_ACRONYM_BY_NAME[normalizedProgram] || normalizedProgram.toUpperCase();
};

export const getProjectProgram = (project?: SupervisorProject | null) =>
  String(project?.program || project?.members?.[0]?.program || 'N/A').trim() || 'N/A';

export const getMemberNames = (project?: SupervisorProject | null) =>
  (project?.members || []).map((member) => member.name).filter(Boolean).join(' & ') || 'Unnamed team';

export const getMemberRollNumbers = (project?: SupervisorProject | null) =>
  (project?.members || []).map((member) => member.rollNo || member.email).filter(Boolean).join(' | ') || 'No roll numbers';

export const getProjectDomainDisplayLabels = (project?: SupervisorProject | null) => {
  const domainIds = normalizeProjectDomainIds(project?.domains, project?.domain);
  const labels = getProjectDomainLabels(domainIds);
  if (labels.length > 0) return labels;
  const legacyDomain = formatProjectDomainLabels(domainIds, project?.domain);
  return legacyDomain ? [legacyDomain] : [];
};

export const getSafePdfKey = (url?: string) => {
  if (!url) return '';
  try {
    const parsedUrl = new URL(url);
    return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  } catch {
    return url.includes('.com/') ? url.split('.com/')[1] : url.replace(/^\//, '');
  }
};

export const hasProjectSubmission = (project: SupervisorProject) => Boolean(project.pdfUrl);
export const isProjectReviewable = (project: SupervisorProject) => isProjectAwaitingReview(project);

export default function SupervisorProjectCard({
  project,
  onOpen,
  readOnly = false,
  highlighted = false,
}: {
  project: SupervisorProject;
  onOpen: (project: SupervisorProject) => void;
  compact?: boolean;
  readOnly?: boolean;
  highlighted?: boolean;
}) {
  const isReviewable = isProjectReviewable(project);
  const members = project.members || [];

  return (
    <button
      id={`project-${project._id}`}
      type="button"
      onClick={() => onOpen(project)}
      className={`group flex min-h-[11rem] w-full flex-col rounded-[1.15rem] border p-4 text-left shadow-[var(--shadow-card)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50 ${
        isReviewable && !readOnly
          ? 'border-amber-300/80 bg-amber-50/70 dark:border-amber-400/25 dark:bg-amber-500/5'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-strong)]'
      } ${highlighted ? 'ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-bg)]' : ''}`}
      aria-label={`Open ${project.projectTitle || 'assigned project'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="portal-eyebrow">Project</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-extrabold leading-5 text-[var(--color-text)]">
            {project.projectTitle || 'Project details not submitted yet'}
          </h3>
        </div>
        {isReviewable && !readOnly ? (
          <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" title="Waiting for review" />
        ) : null}
      </div>

      <div className="mt-4 space-y-2">
        {members.length > 0 ? members.map((member) => (
          <div key={member._id || member.rollNo || member.email || member.name} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-extrabold text-[var(--color-text)]">{member.name || 'Student'}</p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{member.rollNo || member.email || 'No identifier'}</p>
            </div>
            <Badge variant="muted" className="shrink-0">{getProgramName(member.program || getProjectProgram(project))}</Badge>
          </div>
        )) : (
          <p className="text-xs text-[var(--color-text-muted)]">No student information available.</p>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className="text-[11px] font-bold text-[var(--color-text-muted)]">
          {readOnly ? 'Approved project' : isReviewable ? 'Decision needed' : getStatusLabel(project.status)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-extrabold text-[var(--color-text)]">
          Open <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </button>
  );
}
