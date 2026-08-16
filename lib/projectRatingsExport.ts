import {
  formatProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../config/projectDomains';
import {
  parseProjectRatingValues,
  PROJECT_RATING_CATEGORIES,
  type ProjectRatingRound,
  type ProjectRatingsExportFilters,
} from '../config/projectRatings';


export type ProjectRatingsExportProject = {
  _id: unknown;
  title?: unknown;
  domains?: unknown;
  domain?: unknown;
  stage?: unknown;
  status?: unknown;
  supervisorId?: unknown;
  members?: unknown[];
  ratings?: unknown;
};

export type ProjectRatingsExportUser = {
  _id: unknown;
  role?: unknown;
  name?: unknown;
  email?: unknown;
  rollNo?: unknown;
  program?: unknown;
  batch?: unknown;
  semester?: unknown;
};

export type ProjectRatingExportRow = {
  projectId: string;
  projectTitle: string;
  domains: string;
  currentStage: string;
  currentStatus: string;
  ratingRound: string;
  projectIdea: number;
  technicalMerit: number;
  documentationQuality: number;
  ratingDate: string;
  reviewerName: string;
  reviewerRole: string;
  supervisorName: string;
  supervisorEmail: string;
  studentName: string;
  studentRollNumber: string;
  studentEmail: string;
  studentProgram: string;
  studentBatch: string;
  studentSemester: string;
};

function parseThreshold(value: string | null) {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
}

export function parseProjectRatingsExportFilters(
  searchParams: Pick<URLSearchParams, 'get'>
): ProjectRatingsExportFilters | null {
  const round = searchParams.get('round');
  if (round !== 'proposal' && round !== 'thesis') return null;

  const projectIdea = parseThreshold(searchParams.get('projectIdea'));
  const technicalMerit = parseThreshold(searchParams.get('technicalMerit'));
  const documentationQuality = parseThreshold(searchParams.get('documentationQuality'));
  if (projectIdea === null || technicalMerit === null || documentationQuality === null) {
    return null;
  }

  return {
    round,
    minimums: {
      projectIdea,
      technicalMerit,
      documentationQuality,
    },
  };
}

export function buildProjectRatingsExportFilter({
  round,
  minimums,
}: ProjectRatingsExportFilters): Record<string, unknown> {
  const ratingPath = `ratings.${round}`;
  const filter: Record<string, unknown> = { [ratingPath]: { $type: 'object' } };

  for (const { key } of PROJECT_RATING_CATEGORIES) {
    if (minimums[key] > 0) filter[`${ratingPath}.${key}`] = { $gte: minimums[key] };
  }

  return filter;
}

function readSnapshot(project: ProjectRatingsExportProject, round: ProjectRatingRound) {
  if (!project.ratings || typeof project.ratings !== 'object' || Array.isArray(project.ratings)) {
    return null;
  }
  const snapshot = (project.ratings as Record<string, unknown>)[round];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

  const record = snapshot as Record<string, unknown>;
  const scores = parseProjectRatingValues({
    projectIdea: record.projectIdea,
    technicalMerit: record.technicalMerit,
    documentationQuality: record.documentationQuality,
  });
  const ratedAt = record.ratedAt;
  if (!(ratedAt instanceof Date || typeof ratedAt === 'string' || typeof ratedAt === 'number')) {
    return null;
  }
  const ratingDate = new Date(ratedAt);
  if (!scores || Number.isNaN(ratingDate.getTime())) return null;

  return {
    ...scores,
    ratingDate: ratingDate.toISOString(),
    reviewerId: String(record.ratedBy || ''),
  };
}

export function getProjectRatingsExportUserIds(
  projects: ProjectRatingsExportProject[],
  round: ProjectRatingRound
) {
  const ids = new Set<string>();
  for (const project of projects) {
    for (const memberId of project.members || []) {
      const id = String(memberId || '');
      if (id) ids.add(id);
    }
    if (project.supervisorId) ids.add(String(project.supervisorId));
    const reviewerId = readSnapshot(project, round)?.reviewerId;
    if (reviewerId) ids.add(reviewerId);
  }
  return [...ids];
}

export function buildProjectRatingsExportRows(
  projects: ProjectRatingsExportProject[],
  users: ProjectRatingsExportUser[],
  round: ProjectRatingRound
): ProjectRatingExportRow[] {
  const usersById = new Map(users.map((user) => [String(user._id), user]));
  const rows: ProjectRatingExportRow[] = [];

  for (const project of projects) {
    const snapshot = readSnapshot(project, round);
    if (!snapshot) continue;

    const supervisor = usersById.get(String(project.supervisorId || ''));
    const reviewer = usersById.get(snapshot.reviewerId);
    const projectTitle = String(project.title || '');
    const domainIds = normalizeProjectDomainIds(project.domains, project.domain);
    const domains = formatProjectDomainLabels(domainIds, project.domain);

    for (const memberId of new Set((project.members || []).map(String))) {
      const student = usersById.get(memberId);
      if (student?.role !== 'student') continue;

      rows.push({
        projectId: String(project._id),
        projectTitle,
        domains,
        currentStage: String(project.stage || 'PROPOSAL'),
        currentStatus: String(project.status || 'Pending'),
        ratingRound: round === 'proposal' ? 'Proposal' : 'Thesis',
        projectIdea: snapshot.projectIdea,
        technicalMerit: snapshot.technicalMerit,
        documentationQuality: snapshot.documentationQuality,
        ratingDate: snapshot.ratingDate,
        reviewerName: String(reviewer?.name || 'Unknown reviewer'),
        reviewerRole: String(reviewer?.role || 'Unknown'),
        supervisorName: String(supervisor?.name || 'Unassigned'),
        supervisorEmail: String(supervisor?.email || ''),
        studentName: String(student.name || ''),
        studentRollNumber: String(student.rollNo || ''),
        studentEmail: String(student.email || ''),
        studentProgram: String(student.program || ''),
        studentBatch: String(student.batch || ''),
        studentSemester: String(student.semester || ''),
      });
    }
  }

  return rows.sort((a, b) =>
    b.projectIdea - a.projectIdea ||
    a.projectTitle.localeCompare(b.projectTitle) ||
    a.studentRollNumber.localeCompare(b.studentRollNumber) ||
    a.projectId.localeCompare(b.projectId)
  );
}


export function getProjectRatingsExportFilename(round: ProjectRatingRound, now = new Date()) {
  return `project-ratings-${round}-${now.toISOString().slice(0, 10)}.pdf`;
}
