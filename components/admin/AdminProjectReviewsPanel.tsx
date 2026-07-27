'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import SupervisorProjectDialog from '../supervisor/SupervisorProjectDialog';
import SupervisorProjectsSection from '../supervisor/SupervisorProjectsSection';
import {
  getMemberNames,
  getMemberRollNumbers,
  getProgramName,
  getProjectDomainDisplayLabels,
  getProjectProgram,
} from '../supervisor/SupervisorProjectCard';
import type { SupervisorProject } from '../supervisor/supervisorDashboardTypes';

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

export default function AdminProjectReviewsPanel({ showDialog }: { showDialog: ShowDialog }) {
  const [projects, setProjects] = useState<SupervisorProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<SupervisorProject | null>(null);
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/admin/project-reviews', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load submitted projects.');
      }

      setProjects(Array.isArray(data.projects) ? data.projects : []);
    } catch (error) {
      console.error('Admin project review queue error:', error);
      showDialog({
        title: 'Review queue unavailable',
        message: getErrorMessage(error, 'Unable to load submitted projects right now.'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [showDialog]);

  useEffect(() => {
    void Promise.resolve().then(fetchProjects);
  }, [fetchProjects]);

  const programs = useMemo(() => Array.from(new Set(
    projects.map(getProjectProgram).filter((program) => program && program !== 'N/A')
  )).sort((a, b) => getProgramName(a).localeCompare(getProgramName(b))), [projects]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();

    return projects.filter((project) => {
      if (programFilter !== 'All' && getProjectProgram(project) !== programFilter) return false;
      if (!query) return true;

      return [
        getMemberNames(project),
        getMemberRollNumbers(project),
        project.supervisorName,
        getProgramName(getProjectProgram(project)),
        getProjectProgram(project),
        project.projectTitle,
        project.domain,
        ...(project.domains || []),
        ...getProjectDomainDisplayLabels(project),
        project.tools,
        project.status,
        project.batch,
        project.semester,
      ].some((field) => String(field || '').toLowerCase().includes(query));
    });
  }, [programFilter, projects, search]);

  const handleAction = (studentId: string, status: string) => {
    const supervisorName = selectedProject?.supervisorName || 'the assigned supervisor';

    showDialog({
      type: 'prompt',
      title: `${status} Project`,
      message: `Add optional remarks for ${supervisorName}'s review of this team.`,
      placeholder: 'Write remarks for this team...',
      onConfirm: async (remarks = '') => {
        setIsProcessingAction(true);

        try {
          const response = await fetch('/api/admin/project-reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, status, remarks }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || 'Failed to record the project review.');
          }

          setSelectedProject(null);
          await fetchProjects();
          showDialog({ title: 'Project updated', message: `The project has been marked as ${status}.` });
        } catch (error) {
          showDialog({
            title: 'Action failed',
            message: getErrorMessage(error, 'Unable to update this project right now.'),
          });
        } finally {
          setIsProcessingAction(false);
        }
      },
    });
  };

  if (isLoading) {
    return <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">Loading submitted projects...</div>;
  }

  return (
    <>
      <div className="min-h-0 lg:h-full">
        <SupervisorProjectsSection
          title="Project Review Queue"
          description="Submitted projects awaiting a decision. Reviews are applied as the assigned supervisor."
          queueFilter="all"
          hideQueueFilterClear
          search={search}
          onSearchChange={setSearch}
          filterValue={programFilter}
          onFilterChange={setProgramFilter}
          filterOptions={programs}
          filterLabel="Program"
          projects={filteredProjects}
          emptyState={{
            title: 'No projects waiting for review',
            description: 'There are no submitted projects awaiting a review right now.',
          }}
          onOpenProject={setSelectedProject}
        />
      </div>

      <SupervisorProjectDialog
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        isProcessingAction={isProcessingAction}
        onAction={handleAction}
      />
    </>
  );
}
