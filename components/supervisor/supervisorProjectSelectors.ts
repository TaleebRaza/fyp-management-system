import type {
  ProjectQueueFilter,
  SupervisorDashboardStats,
  SupervisorProject,
} from './supervisorDashboardTypes';
import { isProjectApproved } from '../../lib/projectReviewPolicy';

export type SupervisorProjectSelectorAccessors = {
  getMemberNames: (project: SupervisorProject) => unknown;
  getMemberRollNumbers: (project: SupervisorProject) => unknown;
  getProgramName: (program?: string) => unknown;
  getProjectDomainDisplayLabels: (project: SupervisorProject) => unknown[];
  getProjectProgram: (project: SupervisorProject) => string;
  hasProjectSubmission: (project: SupervisorProject) => boolean;
  isProjectReviewable: (project: SupervisorProject) => boolean;
};

export type SupervisorProjectFilters = {
  batchFilter: string;
  programFilter: string;
  projectSearch: string;
  projectQueueFilter: ProjectQueueFilter;
};

export function getUniqueSupervisorBatches(projects: SupervisorProject[]) {
  return Array.from(
    new Set(
      projects
        .map((project) => project.batch)
        .filter((batch): batch is string => Boolean(batch))
    )
  ).sort();
}

export function getUniqueSupervisorPrograms(
  projects: SupervisorProject[],
  configuredPrograms: string[],
  accessors: Pick<SupervisorProjectSelectorAccessors, 'getProjectProgram' | 'getProgramName'>
) {
  const projectPrograms = new Set(projects.map(accessors.getProjectProgram).filter(Boolean));
  const knownPrograms = configuredPrograms.filter((program) => projectPrograms.has(program));
  const extraPrograms = Array.from(projectPrograms).filter(
    (program) => !knownPrograms.includes(program)
  );

  return [...knownPrograms, ...extraPrograms].sort((left, right) =>
    String(accessors.getProgramName(left)).localeCompare(
      String(accessors.getProgramName(right))
    )
  );
}

export function filterSupervisorProjects(
  projects: SupervisorProject[],
  filters: SupervisorProjectFilters,
  accessors: SupervisorProjectSelectorAccessors
) {
  const query = filters.projectSearch.trim().toLowerCase();

  return projects.filter((project) => {
    const projectProgram = accessors.getProjectProgram(project);
    const matchesProgram = !filters.programFilter || projectProgram === filters.programFilter;
    const matchesBatch = filters.batchFilter === 'All' || project.batch === filters.batchFilter;
    const matchesQueue =
      filters.projectQueueFilter === 'submitted'
        ? accessors.hasProjectSubmission(project)
        : filters.projectQueueFilter === 'review'
          ? accessors.isProjectReviewable(project)
          : filters.projectQueueFilter === 'approved'
            ? isProjectApproved(project)
            : true;

    if (!matchesProgram || !matchesBatch || !matchesQueue) return false;
    if (!query) return true;

    const searchableFields = [
      accessors.getMemberNames(project),
      accessors.getMemberRollNumbers(project),
      accessors.getProgramName(projectProgram),
      projectProgram,
      project.projectTitle,
      project.domain,
      ...(Array.isArray(project.domains) ? project.domains : []),
      ...accessors.getProjectDomainDisplayLabels(project),
      project.tools,
      project.status,
      project.batch,
      project.semester,
    ];

    return searchableFields.some((field) =>
      String(field || '').toLowerCase().includes(query)
    );
  });
}

export function getSupervisorDashboardStats(
  projects: SupervisorProject[],
  filteredProjects: SupervisorProject[],
  activeTab: 'overview' | 'projects',
  accessors: Pick<
    SupervisorProjectSelectorAccessors,
    'hasProjectSubmission' | 'isProjectReviewable'
  >
): SupervisorDashboardStats {
  const statProjects = activeTab === 'projects' ? filteredProjects : projects;

  return {
    assigned: statProjects.length,
    submitted: statProjects.filter(accessors.hasProjectSubmission).length,
    approved: statProjects.filter(isProjectApproved).length,
    reviewQueue: statProjects.filter(accessors.isProjectReviewable).length,
  };
}
