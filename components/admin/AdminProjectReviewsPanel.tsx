'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, LockKeyhole, UnlockKeyhole } from 'lucide-react';

import type { ShowDialog } from '../../app/_components/PortalDialog';
import { PROGRAM_MAP } from '../../config/appSettings';
import { Button } from '../ui/SharedUI';
import SupervisorProjectDialog from '../supervisor/SupervisorProjectDialog';
import SupervisorProjectsSection from '../supervisor/SupervisorProjectsSection';
import { getProgramName } from '../supervisor/SupervisorProjectCard';
import type { SupervisorProject } from '../supervisor/supervisorDashboardTypes';

const PAGE_SIZE = 24;

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

type PaginationState = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type FetchProjectsOptions = {
  showLoading?: boolean;
  forceRefresh?: boolean;
};

export default function AdminProjectReviewsPanel({ showDialog }: { showDialog: ShowDialog }) {
  const [projects, setProjects] = useState<SupervisorProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<SupervisorProject | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [programFilter, setProgramFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [projectSubmissionsOpen, setProjectSubmissionsOpen] = useState(true);
  const [isUpdatingSubmissionControl, setIsUpdatingSubmissionControl] = useState(false);
  const latestRequestId = useRef(0);

  const programs = useMemo(
    () => Object.keys(PROGRAM_MAP).sort((a, b) => getProgramName(a).localeCompare(getProgramName(b))),
    []
  );

  const fetchProjects = useCallback(async ({
    showLoading = true,
    forceRefresh = false,
  }: FetchProjectsOptions = {}) => {
    const requestId = ++latestRequestId.current;

    if (showLoading) setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });

      if (debouncedSearch) params.set('search', debouncedSearch);
      if (programFilter !== 'All') params.set('program', programFilter);

      const response = await fetch(`/api/admin/project-reviews?${params.toString()}`, {
        cache: forceRefresh ? 'reload' : 'default',
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load submitted projects.');
      }

      if (requestId !== latestRequestId.current) return;

      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setProjectSubmissionsOpen(data.projectSubmissionsOpen !== false);
      setPagination(data.pagination || {
        page,
        limit: PAGE_SIZE,
        total: Array.isArray(data.projects) ? data.projects.length : 0,
        totalPages: 1,
      });
    } catch (error) {
      if (requestId !== latestRequestId.current) return;

      console.error('Admin project review queue error:', error);
      showDialog({
        title: 'Review queue unavailable',
        message: getErrorMessage(error, 'Unable to load submitted projects right now.'),
      });
    } finally {
      if (showLoading && requestId === latestRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [debouncedSearch, page, programFilter, showDialog]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchProjects();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchProjects]);

  const handleProgramFilterChange = (value: string) => {
    setPage(1);
    setProgramFilter(value);
  };

  const handleAction = (studentId: string, status: string) => {
    const projectBeingReviewed = selectedProject;
    const supervisorName = projectBeingReviewed?.supervisorName || 'the assigned supervisor';

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

          if (projectBeingReviewed) {
            setProjects((currentProjects) =>
              currentProjects.filter((project) => project._id !== projectBeingReviewed._id)
            );
            setPagination((current) => {
              const total = Math.max(current.total - 1, 0);
              return {
                ...current,
                total,
                totalPages: total === 0 ? 0 : Math.ceil(total / current.limit),
              };
            });
          }

          showDialog({
            title: 'Project updated',
            message: `The project has been marked as ${status}.`,
          });

          if (projects.length === 1 && page > 1) {
            setPage((currentPage) => Math.max(currentPage - 1, 1));
          } else {
            void fetchProjects({ showLoading: false, forceRefresh: true });
          }
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

  const updateSubmissionControl = async () => {
    setIsUpdatingSubmissionControl(true);

    try {
      const response = await fetch('/api/admin/project-reviews', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectSubmissionsOpen: !projectSubmissionsOpen }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update project submission control.');
      }

      setProjectSubmissionsOpen(data.projectSubmissionsOpen !== false);
      showDialog({
        title: data.projectSubmissionsOpen === false ? 'Submissions closed' : 'Submissions opened',
        message: data.message || 'Project submission control updated.',
      });
    } catch (error) {
      showDialog({
        title: 'Submission control unavailable',
        message: getErrorMessage(error, 'Unable to update project submission control.'),
      });
    } finally {
      setIsUpdatingSubmissionControl(false);
    }
  };

  if (isLoading && projects.length === 0) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
        Loading submitted projects...
      </div>
    );
  }

  return (
    <>
      <div className="relative flex min-h-0 flex-col lg:h-full" aria-busy={isLoading}>
        <div className="min-h-0 flex-1">
          <SupervisorProjectsSection
            title="Project Review Queue"
            description="Submitted projects awaiting a decision. Reviews are applied as the assigned supervisor."
            queueFilter="all"
            hideQueueFilterClear
            search={search}
            onSearchChange={setSearch}
            filterValue={programFilter}
            onFilterChange={handleProgramFilterChange}
            filterOptions={programs}
            filterLabel="Program"
            projects={projects}
            emptyState={{
              title: 'No projects waiting for review',
              description: 'There are no submitted projects awaiting a review right now.',
            }}
            onOpenProject={setSelectedProject}
            headerActions={
              <Button
                variant={projectSubmissionsOpen ? 'danger' : 'success'}
                disabled={isUpdatingSubmissionControl}
                onClick={() => void updateSubmissionControl()}
              >
                {isUpdatingSubmissionControl ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : projectSubmissionsOpen ? (
                  <LockKeyhole size={16} />
                ) : (
                  <UnlockKeyhole size={16} />
                )}
                {isUpdatingSubmissionControl
                  ? 'Updating...'
                  : projectSubmissionsOpen
                    ? 'Close Submissions'
                    : 'Open Submissions'}
              </Button>
            }
          />
        </div>

        {pagination.totalPages > 1 && (
          <div
            className="pointer-events-none absolute bottom-4 right-4 z-20 flex items-center gap-2"
            role="group"
            aria-label={`Review queue pagination, page ${page} of ${pagination.totalPages}`}
          >
            <button
              type="button"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-lg font-black text-[var(--color-text)] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
              disabled={isLoading || page <= 1}
              onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
              aria-label="Previous review queue page"
              title="Previous page"
            >
              {'<'}
            </button>
            <button
              type="button"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-lg font-black text-[var(--color-text)] shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
              disabled={isLoading || page >= pagination.totalPages}
              onClick={() => setPage((currentPage) => currentPage + 1)}
              aria-label="Next review queue page"
              title="Next page"
            >
              {'>'}
            </button>
          </div>
        )}
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
