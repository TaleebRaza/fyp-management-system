import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { PROGRAM_MAP } from '../../../config/appSettings';
import {
  getMemberNames,
  getMemberRollNumbers,
  getProgramName,
  getProjectDomainDisplayLabels,
  getProjectProgram,
  hasProjectSubmission,
  isProjectReviewable,
} from '../SupervisorProjectCard';
import {
  filterSupervisorProjects,
  getSupervisorDashboardStats,
  getUniqueSupervisorBatches,
  getUniqueSupervisorPrograms,
} from '../supervisorProjectSelectors';
import type {
  ProjectQueueFilter,
  SupervisorProject,
} from '../supervisorDashboardTypes';

export type SupervisorTab = 'overview' | 'projects';

const selectorAccessors = {
  getMemberNames,
  getMemberRollNumbers,
  getProgramName,
  getProjectDomainDisplayLabels,
  getProjectProgram,
  hasProjectSubmission,
  isProjectReviewable,
};

export function useSupervisorProjectFilters({
  projects,
  activeTab,
  setActiveTab,
}: {
  projects: SupervisorProject[];
  activeTab: SupervisorTab;
  setActiveTab: Dispatch<SetStateAction<SupervisorTab>>;
}) {
  const [batchFilter, setBatchFilter] = useState('All');
  const [programFilter, setProgramFilter] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectQueueFilter, setProjectQueueFilter] =
    useState<ProjectQueueFilter>('all');
  const [isProjectMenuExpanded, setProjectMenuExpanded] = useState(false);

  const uniqueBatches = useMemo(
    () => getUniqueSupervisorBatches(projects),
    [projects]
  );
  const uniquePrograms = useMemo(
    () =>
      getUniqueSupervisorPrograms(
        projects,
        Object.keys(PROGRAM_MAP),
        selectorAccessors
      ),
    [projects]
  );
  const filteredProjects = useMemo(
    () =>
      filterSupervisorProjects(
        projects,
        {
          batchFilter,
          programFilter,
          projectSearch,
          projectQueueFilter,
        },
        selectorAccessors
      ),
    [
      batchFilter,
      programFilter,
      projectQueueFilter,
      projectSearch,
      projects,
    ]
  );
  const dashboardStats = useMemo(
    () =>
      getSupervisorDashboardStats(
        projects,
        filteredProjects,
        activeTab,
        selectorAccessors
      ),
    [activeTab, filteredProjects, projects]
  );
  const recentProjects = useMemo(() => projects.slice(0, 5), [projects]);
  const programProjectCounts = useMemo(
    () =>
      uniquePrograms.reduce<Record<string, number>>((counts, program) => {
        counts[program] = projects.filter(
          (project) => getProjectProgram(project) === program
        ).length;
        return counts;
      }, {}),
    [projects, uniquePrograms]
  );

  const openProjectsView = useCallback(
    (queueFilter: ProjectQueueFilter = 'all') => {
      setProjectQueueFilter(queueFilter);
      setActiveTab('projects');
      setProgramFilter('');
      setProjectMenuExpanded(true);
    },
    [setActiveTab]
  );

  const openProjectsFromSidebar = useCallback(() => {
    openProjectsView('all');
    setProjectMenuExpanded((previous) =>
      activeTab === 'projects' ? !previous : true
    );
  }, [activeTab, openProjectsView]);

  const showAllPrograms = useCallback(() => {
    setActiveTab('projects');
    setProgramFilter('');
    setProjectQueueFilter('all');
  }, [setActiveTab]);

  const showProgram = useCallback(
    (program: string) => {
      setActiveTab('projects');
      setProgramFilter(program);
      setProjectQueueFilter('all');
      setProjectMenuExpanded(true);
    },
    [setActiveTab]
  );

  const projectQueueTitle =
    projectQueueFilter === 'submitted'
      ? 'New Documents'
      : projectQueueFilter === 'review'
        ? 'Documents Left To Review'
        : projectQueueFilter === 'approved'
          ? 'Approved Projects'
          : 'Assigned Projects';
  const projectQueueDescription =
    projectQueueFilter === 'submitted'
      ? 'New Documents Submitted By Students'
      : projectQueueFilter === 'review'
        ? 'Documents waiting for your decision. Click to filter.'
        : projectQueueFilter === 'approved'
          ? 'Showing approved projects across all programs.'
          : programFilter
            ? `Showing ${getProgramName(programFilter)} projects only.`
            : 'Showing all programs. Select a specific program from the sidebar to filter.';
  const emptyProjectState =
    projectQueueFilter === 'submitted'
      ? {
          title: 'No new documents found',
          description: 'No students in this view have submitted documents yet.',
        }
      : projectQueueFilter === 'review'
        ? {
            title: 'No projects waiting for review',
            description:
              'There are no submitted, non-approved projects in this view right now.',
          }
        : projectQueueFilter === 'approved'
          ? {
              title: 'No approved projects found',
              description: 'Approved projects will appear here once a review is completed.',
            }
        : {
            title: 'No matching projects',
            description:
              'Try clearing the search field or selecting a different batch filter.',
          };

  return {
    batchFilter,
    setBatchFilter,
    programFilter,
    projectSearch,
    setProjectSearch,
    projectQueueFilter,
    setProjectQueueFilter,
    isProjectMenuExpanded,
    uniqueBatches,
    uniquePrograms,
    filteredProjects,
    dashboardStats,
    recentProjects,
    programProjectCounts,
    projectQueueTitle,
    projectQueueDescription,
    emptyProjectState,
    openProjectsView,
    openProjectsFromSidebar,
    showAllPrograms,
    showProgram,
  };
}
