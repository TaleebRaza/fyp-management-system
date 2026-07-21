import { PROGRAM_MAP } from '../../../config/appSettings';
import {
  formatProjectDomainLabels,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../../config/projectDomains';

export type SupervisorProjectMember = {
  _id?: string;
  name?: string;
  rollNo?: string;
  email?: string;
  program?: string;
};

export type SupervisorProject = {
  _id: string;
  members?: SupervisorProjectMember[];
  triggerStudentId?: string;
  program?: string;
  batch?: string;
  semester?: string;
  status?: string;
  stage?: string;
  pdfUrl?: string;
  projectTitle?: string;
  projectDesc?: string;
  domains?: string[];
  domain?: string;
  tools?: string;
};

export type ProjectQueueFilter = 'all' | 'submitted' | 'review';
export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const PROGRAM_ACRONYM_BY_NAME = Object.entries(PROGRAM_MAP).reduce<Record<string, string>>(
  (acronyms, [acronym, fullName]) => ({ ...acronyms, [fullName]: acronym }),
  {}
);

const REVIEWED_PROJECT_STATUSES = new Set(['Approved', 'Rejected', 'Changes Requested']);

export const getStatusVariant = (status?: string): BadgeVariant => {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Changes Requested' || status === 'Pending') return 'warning';
  return 'muted';
};

export const getProgramName = (program?: string) => {
  const normalizedProgram = String(program || '').trim();
  if (!normalizedProgram || normalizedProgram === 'N/A') return 'N/A';
  if ((PROGRAM_MAP as Record<string, string>)[normalizedProgram]) return normalizedProgram;
  return PROGRAM_ACRONYM_BY_NAME[normalizedProgram] || normalizedProgram.toUpperCase();
};

export const getProjectProgram = (project?: SupervisorProject) =>
  String(project?.program || project?.members?.[0]?.program || 'N/A').trim() || 'N/A';

export const getMemberNames = (project?: SupervisorProject) =>
  project?.members?.map((member) => member.name).filter(Boolean).join(' & ') || 'Unnamed team';

export const getMemberRollNumbers = (project?: SupervisorProject) =>
  project?.members?.map((member) => member.rollNo || member.email).filter(Boolean).join(' | ') || 'No roll numbers';

export const getProjectDomainDisplayLabels = (project?: SupervisorProject) => {
  const domainIds = normalizeProjectDomainIds(project?.domains, project?.domain);
  const labels = getProjectDomainLabels(domainIds);
  if (labels.length > 0) return labels;
  const legacyDomain = formatProjectDomainLabels(domainIds, project?.domain);
  return legacyDomain ? [legacyDomain] : [];
};

export const getSafePdfKey = (url?: string) => {
  if (!url) return '';
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''));
  } catch {
    return url.includes('.com/') ? url.split('.com/')[1] : url.replace(/^\//, '');
  }
};

export const hasProjectSubmission = (project: SupervisorProject) => Boolean(project.pdfUrl);

export const isProjectReviewable = (project: SupervisorProject) =>
  hasProjectSubmission(project) && !REVIEWED_PROJECT_STATUSES.has(String(project.status || '').trim());
