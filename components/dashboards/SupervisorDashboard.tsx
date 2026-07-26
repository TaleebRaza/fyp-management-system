'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  ChevronDown,
  Download,
  FileText,
  LayoutDashboard,
  Loader2,
  LogIn,
} from 'lucide-react';

import BroadcastWidget from './BroadcastWidget';
import { PROGRAM_MAP } from '../../config/appSettings';
import SupervisorOverviewSection from '../supervisor/SupervisorOverviewSection';
import SupervisorProjectsSection from '../supervisor/SupervisorProjectsSection';
import SupervisorProjectDialog from '../supervisor/SupervisorProjectDialog';
import {
  getMemberNames,
  getMemberRollNumbers,
  getProgramName,
  getProjectDomainDisplayLabels,
  getProjectProgram,
  hasProjectSubmission,
  isProjectReviewable,
} from '../supervisor/SupervisorProjectCard';
import type {
  ProjectQueueFilter,
  SupervisorDashboardProps,
  SupervisorProject,
} from '../supervisor/supervisorDashboardTypes';

import {
  Button,
  DashboardShell,
} from '../ui/SharedUI';



type SupervisorTab = 'overview' | 'projects';
const FALLBACK_THEME = {
  name: 'Professional',
  bg: 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]',
  text: 'text-[var(--color-accent)]',
  ring: 'focus:ring-[var(--color-accent)]/30',
  lightBg: 'bg-[var(--color-accent-soft)]',
  border: 'border-[var(--color-accent)]',
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const SupervisorDashboard = ({
  isDarkMode = false,
  theme = FALLBACK_THEME,
  session,
  showDialog,
}: SupervisorDashboardProps) => {
  const [activeTab, setActiveTab] = useState<SupervisorTab>('overview');
  const [myProjects, setMyProjects] = useState<SupervisorProject[]>([]);
  const [migrationInput, setMigrationInput] = useState<Record<string, string>>({});
  const [migrationStudentId, setMigrationStudentId] = useState<string>('');
  const [myMigrationCode, setMyMigrationCode] = useState<string>('Loading...');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<SupervisorProject | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [batchFilter, setBatchFilter] = useState('All');
  const [programFilter, setProgramFilter] = useState('');
  const [isProjectMenuExpanded, setProjectMenuExpanded] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectQueueFilter, setProjectQueueFilter] = useState<ProjectQueueFilter>('all');
  

  const supervisorName = session?.user?.name || 'Supervisor';
  const supervisorId = String((session.user as { id?: string }).id || '');

  const notify = useCallback((title: string, message: string) => {
    if (showDialog) {
      showDialog({ title, message });
      return;
    }

    window.alert(`${title}\n\n${message}`);
  }, [showDialog]);

  const requestConfirmation = (title: string, message: string, onConfirm: () => Promise<void> | void) => {
    if (showDialog) {
      showDialog({
        type: 'confirm',
        title,
        message,
        onConfirm,
      });
      return;
    }

    if (window.confirm(message)) {
      void onConfirm();
    }
  };

  const requestRemarks = (title: string, message: string, onConfirm: (remarks: string) => Promise<void>) => {
    if (showDialog) {
      showDialog({
        type: 'prompt',
        title,
        message,
        placeholder: 'Write remarks for this team...',
        onConfirm: (value) => onConfirm(value || ''),
      });
      return;
    }

    const remarks = window.prompt(message, '');
    if (remarks !== null) {
      void onConfirm(remarks);
    }
  };

  const fetchProjects = useCallback(async () => {
    try {
      if (!supervisorId) {
        throw new Error('Supervisor session is missing. Please sign in again.');
      }

      setIsLoading(true);

      const response = await fetch('/api/dashboard/supervisor');
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load supervisor projects.');
      }

      setMyProjects(Array.isArray(json.projects) ? json.projects : []);
      setMyMigrationCode(json.migrationCode || 'N/A');
    } catch (error) {
      console.error('Supervisor dashboard fetch error:', error);
      notify(
        'Dashboard unavailable',
        getErrorMessage(error, 'Unable to load supervisor dashboard right now. Please refresh and try again.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [notify, supervisorId]);

  useEffect(() => {
    void Promise.resolve().then(fetchProjects);
  }, [fetchProjects]);

  const uniqueBatches = useMemo(() => {
    return Array.from(
      new Set(myProjects.map((project) => project.batch).filter((batch): batch is string => Boolean(batch)))
    ).sort();
  }, [myProjects]);

  const uniquePrograms = useMemo(() => {
    const projectPrograms = new Set(myProjects.map(getProjectProgram).filter(Boolean));
    const configuredPrograms = Object.keys(PROGRAM_MAP).filter((program) => projectPrograms.has(program));
    const extraPrograms = Array.from(projectPrograms).filter((program) => !configuredPrograms.includes(program));

    return [...configuredPrograms, ...extraPrograms].sort((a, b) => getProgramName(a).localeCompare(getProgramName(b)));
  }, [myProjects]);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();

    return myProjects.filter((project) => {
      const matchesProgram = !programFilter || getProjectProgram(project) === programFilter;
      const matchesBatch = batchFilter === 'All' || project.batch === batchFilter;
      const matchesQueue =
        projectQueueFilter === 'submitted'
          ? hasProjectSubmission(project)
          : projectQueueFilter === 'review'
            ? isProjectReviewable(project)
            : true;

      if (!matchesProgram || !matchesBatch || !matchesQueue) return false;
      if (!query) return true;

      const searchableFields = [
        getMemberNames(project),
        getMemberRollNumbers(project),
        getProgramName(getProjectProgram(project)),
        getProjectProgram(project),
        project.projectTitle,
        project.domain,
        ...(Array.isArray(project.domains) ? project.domains : []),
        ...getProjectDomainDisplayLabels(project),
        project.tools,
        project.status,
        project.batch,
        project.semester,
      ];

      return searchableFields.some((field) => String(field || '').toLowerCase().includes(query));
    });
  }, [myProjects, batchFilter, programFilter, projectSearch, projectQueueFilter]);

  const dashboardStats = useMemo(() => {
    const statProjects = activeTab === 'projects' ? filteredProjects : myProjects;
    const submittedProjects = statProjects.filter(hasProjectSubmission);
    const approvedProjects = statProjects.filter((project) => project.status === 'Approved');
    const reviewQueue = statProjects.filter((project) => {
      return isProjectReviewable(project);
    });

    return {
      assigned: statProjects.length,
      submitted: submittedProjects.length,
      approved: approvedProjects.length,
      reviewQueue: reviewQueue.length,
    };
  }, [activeTab, filteredProjects, myProjects]);

  const recentProjects = useMemo(() => myProjects.slice(0, 5), [myProjects]);

  const handleAction = async (triggerStudentId: string, newStatus: string) => {
    requestRemarks(
      `${newStatus} Project`,
      `Add optional remarks for marking this team's project as ${newStatus}:`,
      async (remarksValue: string) => {
        setIsProcessingAction(true);

        try {
          const response = await fetch('/api/dashboard/supervisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'updateStatus',
              studentId: triggerStudentId,
              status: newStatus,
              remarks: String(remarksValue || '').trim() || 'No remarks provided.',
            }),
          });

          const json = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(json.error || 'Server failed to process the request.');
          }

          setSelectedProject(null);
          await fetchProjects();

          notify('Project updated', `The project has been marked as ${newStatus}.`);
        } catch (error) {
          notify(
            'Action failed',
            getErrorMessage(error, 'Failed to update project status. Please check your connection and try again.')
          );
        } finally {
          setIsProcessingAction(false);
        }
      }
    );
  };

  const handleMigrate = async (studentId: string, projectId: string) => {
  const migrationCode = String(migrationInput[projectId] || '').trim().toUpperCase();

  if (!migrationCode) {
    notify('Input required', 'Enter the target supervisor migration code before migrating a student.');
    return;
  }

  if (!studentId) {
    notify('Select a student', 'Choose a student from the team to migrate.');
    return;
  }

  setIsProcessingAction(true);

  try {
    const response = await fetch('/api/dashboard/supervisor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'migrate',
        studentId,
        migrationCode,
      }),
    });

    const json = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(json.error || 'Invalid migration code.');
    }

    setMigrationInput((previous) => ({ ...previous, [projectId]: '' }));
    setSelectedProject(null);
    await fetchProjects();

    notify('Student migrated', json.message || 'The student was migrated successfully.');
  } catch (error) {
    notify('Migration failed', getErrorMessage(error, 'Unable to migrate this student right now.'));
  } finally {
    setIsProcessingAction(false);
  }
};

  const handleExpandTeam = (projectId: string) => {
    requestConfirmation(
      'Allow a third team member?',
      'This team will be allowed to share its invite code with one additional student.',
      async () => {
        setIsProcessingAction(true);
        try {
          const response = await fetch('/api/dashboard/supervisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'expandTeam', projectId }),
          });
          const json = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(json.error || 'Failed to update team capacity.');
          }

          setSelectedProject(null);
          await fetchProjects();
          notify('Three-member team approved', json.message || 'The team can now add a third member.');
        } catch (error) {
          notify('Capacity update failed', getErrorMessage(error, 'Unable to update this team right now.'));
        } finally {
          setIsProcessingAction(false);
        }
      }
    );
  };

  const handleRemoveTeam = (triggerStudentId: string, teamNames: string) => {
    requestConfirmation(
      'Remove team?',
      `Remove ${teamNames} from your supervision list? They will need to select a supervisor again.`,
      async () => {
        setIsProcessingAction(true);

        try {
          const response = await fetch('/api/dashboard/supervisor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'removeStudent',
              studentId: triggerStudentId,
            }),
          });

          const json = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(json.error || 'Failed to remove team.');
          }

          setSelectedProject(null);
          await fetchProjects();

          notify('Team removed', json.message || 'The team was removed from your supervision list.');
        } catch (error) {
          notify('Remove failed', getErrorMessage(error, 'Unable to remove this team right now.'));
        } finally {
          setIsProcessingAction(false);
        }
      }
    );
  };

  const handleExportPDF = async () => {
    setIsExporting(true);

    try {
      const response = await fetch(
        `/api/export-pdf?id=${encodeURIComponent(supervisorId)}&name=${encodeURIComponent(supervisorName)}&batch=${encodeURIComponent(batchFilter)}&program=${encodeURIComponent(programFilter || 'All')}`
      );

      if (!response.ok) {
        throw new Error(`Export failed. Server responded with status: ${response.status}.`);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error('The exported file was empty.');
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');

      downloadLink.href = downloadUrl;
      downloadLink.download = `fyp-report-${supervisorName.replace(/\s+/g, '-')}.xlsx`;
      document.body.appendChild(downloadLink);
      downloadLink.click();

      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(downloadLink);
    } catch (error) {
      notify('Export failed', getErrorMessage(error, 'An unexpected error occurred during export.'));
    } finally {
      setIsExporting(false);
    }
  };

const openProjectsView = (queueFilter: ProjectQueueFilter = 'all') => {
  setProjectQueueFilter(queueFilter);
  setActiveTab('projects');
  setProgramFilter(''); // <-- Clear filter to show all programs
  setProjectMenuExpanded(true);
}; 

  const projectQueueTitle =
    projectQueueFilter === 'submitted'
      ? 'Submitted Projects'
      : projectQueueFilter === 'review'
        ? 'Review Queue'
        : 'Assigned Projects';

  const projectQueueDescription =
      projectQueueFilter === 'submitted'
        ? 'Showing teams with an attached PDF across all programs.'
        : projectQueueFilter === 'review'
          ? 'Showing submitted projects still waiting for your decision across all programs.'
          : programFilter
            ? `Showing ${getProgramName(programFilter)} projects only.`
            : 'Showing all programs. Select a specific program from the sidebar to filter.';

  const emptyProjectState =
    projectQueueFilter === 'submitted'
      ? {
          title: 'No submitted projects found',
          description: 'No teams in this view have attached a PDF yet.',
        }
      : projectQueueFilter === 'review'
        ? {
            title: 'No projects waiting for review',
            description: 'There are no submitted, non-approved projects in this view right now.',
          }
        : {
            title: 'No matching projects',
            description: 'Try clearing the search field or selecting a different batch filter.',
          };

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <Loader2 className="mb-4 animate-spin text-[var(--color-accent)]" size={36} />
        <p className="text-sm font-bold text-[var(--color-text-muted)]">
          Loading supervisor workspace...
        </p>
      </div>
    );
  }

  const programProjectCounts = uniquePrograms.reduce<Record<string, number>>((counts, program) => {
    counts[program] = myProjects.filter((project) => getProjectProgram(project) === program).length;
    return counts;
  }, {});

  const openProjectsFromSidebar = () => {
    openProjectsView('all');
    setProjectMenuExpanded((previous) => (activeTab === 'projects' ? !previous : true));
  };

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <LayoutDashboard size={18} />,
      active: activeTab === 'overview',
      onClick: () => setActiveTab('overview'),
    },
    {
      id: 'projects',
      label: 'Assigned Projects',
      icon: isProjectMenuExpanded ? <ChevronDown size={18} /> : <FileText size={18} />,
      active: activeTab === 'projects',
      badge: myProjects.length,
      onClick: openProjectsFromSidebar,
    },
    ...(isProjectMenuExpanded
      ? [
          {
            id: 'program-all',
            label: 'All Programs',
            icon: <span className="ml-5 h-1.5 w-1.5 rounded-full bg-current" />,
            active: activeTab === 'projects' && !programFilter,
            badge: myProjects.length,
            onClick: () => {
              setActiveTab('projects');
              setProgramFilter('');
              setProjectQueueFilter('all');
            },
          },
          ...uniquePrograms.map((program) => ({
            id: `program-${program}`,
            label: getProgramName(program),
            icon: <span className="ml-5 h-1.5 w-1.5 rounded-full bg-current" />,
            active: activeTab === 'projects' && programFilter === program,
            badge: programProjectCounts[program],
            onClick: () => {
              setActiveTab('projects');
              setProgramFilter(program);
              setProjectQueueFilter('all');
              setProjectMenuExpanded(true);
            },
          })),
        ]
      : []),
  ];

  return (
    <>
      <DashboardShell
        title="Supervisor Dashboard"
        description={`Manage FYP teams, reviews, broadcasts, and project decisions for ${supervisorName}.`}
        navItems={navItems}
        className={`lg:h-[calc(100vh-7.5rem)] lg:min-h-0 [&>div]:lg:h-full [&>div]:lg:min-h-0 ${
          activeTab === 'projects' ? '[&>div>div>main]:lg:overflow-hidden' : ''
        }`}
        user={{
          name: supervisorName,
          role: `Supervisor · Code ${myMigrationCode}`,
        }}
        actions={
          <div className="grid gap-2 sm:flex">
            <BroadcastWidget isDarkMode={isDarkMode} theme={theme} showDialog={showDialog} />

            <Button variant="outline" onClick={handleExportPDF} disabled={isExporting}>
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>

            <Button variant="danger" onClick={() => signOut({ redirect: false })}>
              <LogIn size={16} className="rotate-180" />
              Logout
            </Button>
          </div>
        }
      >
        {activeTab === 'overview' && (
          <SupervisorOverviewSection
            stats={dashboardStats}
            recentProjects={recentProjects}
            myMigrationCode={myMigrationCode}
            isDarkMode={isDarkMode}
            theme={theme}
            showDialog={showDialog}
            isExporting={isExporting}
            onExport={handleExportPDF}
            onOpenProjects={openProjectsView}
            onOpenProject={setSelectedProject}
          />
        )}
        {activeTab === 'projects' && (
          <div className="min-h-0 lg:h-full">
            <SupervisorProjectsSection
              title={projectQueueTitle}
              description={projectQueueDescription}
              queueFilter={projectQueueFilter}
              onClearQueueFilter={() => setProjectQueueFilter('all')}
              isExporting={isExporting}
              onExport={handleExportPDF}
              search={projectSearch}
              onSearchChange={setProjectSearch}
              batchFilter={batchFilter}
              onBatchFilterChange={setBatchFilter}
              batches={uniqueBatches}
              projects={filteredProjects}
              emptyState={emptyProjectState}
              onOpenProject={(project) => {
                setSelectedProject(project);
                setMigrationStudentId(project.members?.[0]?._id || project.triggerStudentId);
              }}
            />
          </div>
        )}
      </DashboardShell>

      <SupervisorProjectDialog
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        isProcessingAction={isProcessingAction}
        onAction={handleAction}
        supervisorId={supervisorId}
        theme={theme}
        isDarkMode={isDarkMode}
        migrationStudentId={migrationStudentId}
        onMigrationStudentChange={setMigrationStudentId}
        migrationCode={selectedProject ? migrationInput[selectedProject._id] || '' : ''}
        onMigrationCodeChange={(value) => {
          if (!selectedProject) return;
          setMigrationInput((previous) => ({ ...previous, [selectedProject._id]: value }));
        }}
        onMigrate={() => {
          if (selectedProject) void handleMigrate(migrationStudentId, selectedProject._id);
        }}
        onExpandTeam={() => {
          if (selectedProject) handleExpandTeam(selectedProject._id);
        }}
        onRemoveTeam={() => {
          if (selectedProject) {
            handleRemoveTeam(selectedProject.triggerStudentId, getMemberNames(selectedProject));
          }
        }}
      />
    </>
  );
};

export default SupervisorDashboard;
