import { ChevronRight } from 'lucide-react';
import { PROGRAM_MAP } from '../../config/appSettings';
import {
  formatProjectDomainLabels,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../config/projectDomains';
import { AvatarBadge, Badge } from '../ui';
import { isProjectAwaitingReview } from '../../lib/projectReviewPolicy';
import type { SupervisorProject } from './supervisorDashboardTypes';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'muted';

export const getStatusVariant = (status?: string): BadgeVariant => {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Changes Requested' || status === 'Pending') return 'warning';
  return 'muted';
};

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

export const isProjectReviewable = (project: SupervisorProject) =>
  isProjectAwaitingReview(project);

export default function SupervisorProjectCard({
  project,
  onOpen,
  compact = false,
  readOnly = false,
}: {
  project: SupervisorProject;
  onOpen: (project: SupervisorProject) => void;
  compact?: boolean;
  readOnly?: boolean;
}) {
  const memberNames = getMemberNames(project);
  const memberRollNumbers = getMemberRollNumbers(project);
  const pdfKey = getSafePdfKey(project.pdfUrl);
  const isReviewable = isProjectReviewable(project);
  const domainLabels = getProjectDomainDisplayLabels(project);

  if (readOnly) {
    return (
      <article className="flex min-h-full flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <AvatarBadge name={memberNames} className="h-11 w-11" />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-[var(--color-text)]">{memberNames}</h3>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--color-text-muted)]">{memberRollNumbers}</p>
            </div>
          </div>
          <Badge variant="success">Project Approved</Badge>
        </div>

        <div className="mt-4 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Project</p>
          <p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-[var(--color-text)]">{project.projectTitle || 'Project details not submitted yet.'}</p>
        </div>
      </article>
    );
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onOpen(project)}
        className="group flex min-h-full flex-col rounded-xl border border-pink-500/70 bg-pink-50/80 p-3 text-left shadow-sm ring-1 ring-pink-500/20 transition-colors hover:bg-pink-50 dark:bg-pink-500/10 dark:hover:bg-pink-500/15"
        aria-label={`Open project review for ${memberNames}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <AvatarBadge name={memberNames} className="h-9 w-9 rounded-lg text-xs" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-[var(--color-text)]">{memberNames}</h3>
            <p className="mt-0.5 truncate text-xs font-semibold text-[var(--color-text-muted)]">{memberRollNumbers}</p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Badge variant="muted" className="min-w-0 flex-1 justify-center truncate">{getProgramName(getProjectProgram(project))}</Badge>
          <Badge variant="muted" className="min-w-0 flex-1 justify-center truncate">{project.batch || 'Not assigned'}</Badge>
        </div>
        <div className="mt-2.5 flex">
          <Badge variant="muted" className="max-w-full truncate">Supervisor: {project.supervisorName || 'Not assigned'}</Badge>
        </div>

        <div className="mt-3 border-t border-pink-500/20 pt-2.5">
          <p className="text-xs text-[var(--color-text-muted)]">Project title</p>
          <p className="mt-0.5 line-clamp-2 text-sm font-bold leading-5 text-[var(--color-text)]">{project.projectTitle || 'Project details not submitted yet.'}</p>
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(project)}
      className={`group flex min-h-full flex-col rounded-xl border p-4 text-left transition-colors ${
        isReviewable
          ? 'border-pink-500/70 bg-pink-50/80 shadow-sm ring-1 ring-pink-500/20 hover:bg-pink-50 dark:bg-pink-500/10 dark:hover:bg-pink-500/15'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <AvatarBadge name={memberNames} className="h-11 w-11" />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-[var(--color-text)]">{memberNames}</h3>
            <p className="mt-1 truncate text-xs font-semibold text-[var(--color-text-muted)]">{memberRollNumbers}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={getStatusVariant(project.status)}>{project.status || 'Pending'}</Badge>
          {isReviewable && <span className="inline-flex items-center rounded-full border border-pink-500/40 bg-white/90 px-2.5 py-1 text-xs font-extrabold text-pink-700 shadow-sm dark:border-pink-300/30 dark:bg-pink-500/20 dark:text-pink-100">Waiting for review</span>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Badge variant="muted">{getProgramName(getProjectProgram(project))}</Badge>
        {project.batch && <Badge variant="muted">{project.batch}</Badge>}
        {project.semester && <Badge variant="muted">{project.semester}</Badge>}
        {project.supervisorName && <Badge variant="muted">Supervisor: {project.supervisorName}</Badge>}
        {domainLabels.map((domainLabel) => <Badge key={domainLabel} variant="accent">{domainLabel}</Badge>)}
      </div>

      <div className={`mt-4 flex-1 rounded-xl border p-4 ${isReviewable ? 'border-pink-500/30 bg-white/70 dark:bg-pink-950/20' : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'}`}>
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Project</p>
        {project.projectTitle ? (
          <>
            <p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-[var(--color-text)]">{project.projectTitle}</p>
            {project.tools && <p className="mt-2 line-clamp-1 text-xs font-semibold text-[var(--color-text-muted)]">{project.tools}</p>}
          </>
        ) : (
          <p className="mt-2 text-sm font-semibold text-[var(--color-text-muted)]">Project details not submitted yet.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
        <span className={`text-xs font-bold ${isReviewable ? 'text-pink-700 dark:text-pink-200' : 'text-[var(--color-text-muted)]'}`}>{pdfKey ? 'PDF attached' : 'No PDF attached'}</span>
        <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-accent)]">Review<ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
      </div>
    </button>
  );
}
