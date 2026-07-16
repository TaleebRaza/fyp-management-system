'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  ArrowRightLeft,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  LogIn,
  Megaphone,
  Search,
  UserMinus,
  Users,
  Wrench,
} from 'lucide-react';

import BroadcastWidget from './BroadcastWidget';
import { VoiceChat } from '../ui/VoiceChat';
import { PROGRAM_MAP } from '../../config/appSettings';

import {
  AvatarBadge,
  Badge,
  Button,
  DashboardGrid,
  DashboardPanel,
  DashboardShell,
  Dialog,
  EmptyState,
  SectionHeader,
  Select,
  StatCard,
  StyledInput,
} from '../ui/SharedUI';



type SupervisorTab = 'overview' | 'projects';
type ProjectQueueFilter = 'all' | 'submitted' | 'review';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const FALLBACK_THEME = {
  name: 'Professional',
  bg: 'bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)]',
  text: 'text-[var(--color-accent)]',
  ring: 'focus:ring-[var(--color-accent)]/30',
  lightBg: 'bg-[var(--color-accent-soft)]',
  border: 'border-[var(--color-accent)]',
};

const STAGES = [
  { id: 'PROPOSAL', label: 'Proposal' },
  { id: 'THESIS_DRAFT', label: 'Thesis Draft' },
  { id: 'FINAL_DELIVERABLES', label: 'Final Deliverables' },
];

const getStatusVariant = (status?: string): BadgeVariant => {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Changes Requested') return 'warning';
  if (status === 'Pending') return 'warning';
  return 'muted';
};

const PROGRAM_ACRONYM_BY_NAME = Object.entries(PROGRAM_MAP).reduce<Record<string, string>>(
  (acronyms, [acronym, fullName]) => ({ ...acronyms, [fullName]: acronym }),
  {}
);

const getProgramName = (program?: string) => {
  const normalizedProgram = String(program || '').trim();

  if (!normalizedProgram || normalizedProgram === 'N/A') return 'N/A';
  if ((PROGRAM_MAP as Record<string, string>)[normalizedProgram]) return normalizedProgram;

  return PROGRAM_ACRONYM_BY_NAME[normalizedProgram] || normalizedProgram.toUpperCase();
};

const getProjectProgram = (project?: any) => {
  return String(project?.program || project?.members?.[0]?.program || 'N/A').trim() || 'N/A';
};

const getMemberNames = (project?: any) => {
  const members = Array.isArray(project?.members) ? project.members : [];
  return members.map((member: any) => member.name).filter(Boolean).join(' & ') || 'Unnamed team';
};

const getMemberRollNumbers = (project?: any) => {
  const members = Array.isArray(project?.members) ? project.members : [];
  return members.map((member: any) => member.rollNo || member.email).filter(Boolean).join(' | ') || 'No roll numbers';
};

const getStageProgress = (stage?: string) => {
  const index = Math.max(
    STAGES.findIndex((item) => item.id === stage),
    0
  );

  return Math.round(((index + 1) / STAGES.length) * 100);
};

const getSafePdfKey = (url?: string) => {
  if (!url) return '';

  try {
    const parsedUrl = new URL(url);
    return decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  } catch {
    return url.includes('.com/') ? url.split('.com/')[1] : url.replace(/^\//, '');
  }
};

const REVIEWED_PROJECT_STATUSES = new Set(['Approved', 'Rejected', 'Changes Requested']);

const hasProjectSubmission = (project: any) => {
  return Boolean(project?.pdfUrl);
};

const isProjectReviewable = (project: any) => {
  const status = String(project?.status || '').trim();
  return hasProjectSubmission(project) && !REVIEWED_PROJECT_STATUSES.has(status);
};

const ProjectTimeline = ({ currentStage }: { currentStage?: string }) => {
  const currentIndex = Math.max(
    STAGES.findIndex((stage) => stage.id === currentStage),
    0
  );

  return (
    <DashboardPanel>
      <SectionHeader
        title="Project Progress"
        description={`${getStageProgress(currentStage)}% complete based on the current project stage.`}
      />

      <div className="portal-scrollbar overflow-x-auto">
        <div className="relative flex min-w-[560px] items-start justify-between gap-4 pb-2">
          <div className="absolute left-10 right-10 top-5 h-px bg-[var(--color-border)]" />

          {STAGES.map((stage, index) => {
            const isDone = index < currentIndex;
            const isActive = index === currentIndex;

            return (
              <div
                key={stage.id}
                className="relative z-10 flex flex-1 flex-col items-center text-center"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${
                    isDone
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : isActive
                        ? 'border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {isDone ? <CheckCircle size={18} /> : index + 1}
                </div>

                <p
                  className={`mt-3 text-sm font-semibold ${
                    isActive || isDone
                      ? 'text-[var(--color-text)]'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {stage.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardPanel>
  );
};

const SupervisorDashboard = ({
  isDarkMode = false,
  theme = FALLBACK_THEME,
  session,
  showDialog,
}: any) => {
  const [activeTab, setActiveTab] = useState<SupervisorTab>('overview');
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [migrationInput, setMigrationInput] = useState<Record<string, string>>({});
  const [migrationStudentId, setMigrationStudentId] = useState<string>('');
  const [myMigrationCode, setMyMigrationCode] = useState<string>('Loading...');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [batchFilter, setBatchFilter] = useState('All');
  const [programFilter, setProgramFilter] = useState('');
  const [isProjectMenuExpanded, setProjectMenuExpanded] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectQueueFilter, setProjectQueueFilter] = useState<ProjectQueueFilter>('all');
  

  const supervisorName = session?.user?.name || 'Supervisor';
  const supervisorId = (session?.user as any)?.id;
  const supervisorRollNo = (session?.user as any)?.rollNo;

  const notify = (title: string, message: string) => {
    if (showDialog) {
      showDialog({ title, message });
      return;
    }

    window.alert(`${title}\n\n${message}`);
  };

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
        onConfirm,
      });
      return;
    }

    const remarks = window.prompt(message, '');
    if (remarks !== null) {
      void onConfirm(remarks);
    }
  };

  const fetchProjects = async () => {
    try {
      if (!supervisorId) {
        throw new Error('Supervisor session is missing. Please sign in again.');
      }

      setIsLoading(true);

      const response = await fetch(`/api/dashboard/supervisor?id=${encodeURIComponent(supervisorId)}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load supervisor projects.');
      }

      setMyProjects(Array.isArray(json.projects) ? json.projects : []);

      try {
        const supervisorResponse = await fetch('/api/supervisors');
        const supervisorData = await supervisorResponse.json();
        const supervisors = Array.isArray(supervisorData) ? supervisorData : [];
        const currentSupervisor = supervisors.find((supervisor: any) => supervisor.rollNo === supervisorRollNo);

        setMyMigrationCode(currentSupervisor?.migrationCode || 'N/A');
      } catch (error) {
        console.error('Migration code fetch error:', error);
        setMyMigrationCode('Unavailable');
      }
    } catch (error: any) {
      console.error('Supervisor dashboard fetch error:', error);
      notify(
        'Dashboard unavailable',
        error.message || 'Unable to load supervisor dashboard right now. Please refresh and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchProjects();
  }, [supervisorId]);

  const uniqueBatches = useMemo(() => {
    return Array.from(new Set(myProjects.map((project: any) => project.batch).filter(Boolean))).sort();
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
        } catch (error: any) {
          notify(
            'Action failed',
            error.message || 'Failed to update project status. Please check your connection and try again.'
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
  } catch (error: any) {
    notify('Migration failed', error.message || 'Unable to migrate this student right now.');
  } finally {
    setIsProcessingAction(false);
  }
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
        } catch (error: any) {
          notify('Remove failed', error.message || 'Unable to remove this team right now.');
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
    } catch (error: any) {
      notify('Export failed', error.message || 'An unexpected error occurred during export.');
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

  const renderProjectCard = (project: any) => {
    const memberNames = getMemberNames(project);
    const memberRollNumbers = getMemberRollNumbers(project);
    const pdfKey = getSafePdfKey(project.pdfUrl);
    const isReviewable = isProjectReviewable(project);

    return (
      <button
        key={project._id}
        type="button"
        onClick={() => {
          setSelectedProject(project);
          const firstMember = project.members?.[0]?._id || project.triggerStudentId;
          setMigrationStudentId(firstMember);
        }}
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
              <h3 className="truncate text-sm font-bold text-[var(--color-text)]">
                {memberNames}
              </h3>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--color-text-muted)]">
                {memberRollNumbers}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <Badge variant={getStatusVariant(project.status)}>{project.status || 'Pending'}</Badge>
            {isReviewable && (
              <span className="inline-flex items-center rounded-full border border-pink-500/40 bg-white/90 px-2.5 py-1 text-xs font-extrabold text-pink-700 shadow-sm dark:border-pink-300/30 dark:bg-pink-500/20 dark:text-pink-100">
                Waiting for review
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="muted">{getProgramName(getProjectProgram(project))}</Badge>
          {project.batch && <Badge variant="muted">{project.batch}</Badge>}
          {project.semester && <Badge variant="muted">{project.semester}</Badge>}
          {project.domain && <Badge variant="accent">{project.domain}</Badge>}
        </div>

        <div
          className={`mt-4 flex-1 rounded-xl border p-4 ${
            isReviewable
              ? 'border-pink-500/30 bg-white/70 dark:bg-pink-950/20'
              : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
            Project
          </p>

          {project.projectTitle ? (
            <>
              <p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-[var(--color-text)]">
                {project.projectTitle}
              </p>
              {project.tools && (
                <p className="mt-2 line-clamp-1 text-xs font-semibold text-[var(--color-text-muted)]">
                  {project.tools}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-[var(--color-text-muted)]">
              Project details not submitted yet.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4">
          <span
            className={`text-xs font-bold ${
              isReviewable ? 'text-pink-700 dark:text-pink-200' : 'text-[var(--color-text-muted)]'
            }`}
          >
            {pdfKey ? 'PDF attached' : 'No PDF attached'}
          </span>

          <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-accent)]">
            Review
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </button>
    );
  };

  const renderOverview = () => (
    <div className="space-y-7 sm:space-y-6">
      <DashboardGrid>
        <StatCard
          label="Assigned Teams"
          value={dashboardStats.assigned}
          hint={activeTab === 'projects' && programFilter ? `Filtered by ${getProgramName(programFilter)}.` : 'All assigned teams.'}
          icon={<Users size={20} />}
          onClick={() => openProjectsView('all')}
          isActive={activeTab === 'projects' && projectQueueFilter === 'all'}
        />

        <StatCard
          label="Submitted Projects"
          value={dashboardStats.submitted}
          hint="Teams with a PDF attached. Click to filter."
          icon={<FileText size={20} />}
          onClick={() => openProjectsView('submitted')}
          isActive={activeTab === 'projects' && projectQueueFilter === 'submitted'}
        />

        <StatCard
          label="Review Queue"
          value={dashboardStats.reviewQueue}
          hint="Submitted projects waiting for your decision. Click to filter."
          icon={<LayoutDashboard size={20} />}
          onClick={() => openProjectsView('review')}
          isActive={activeTab === 'projects' && projectQueueFilter === 'review'}
        />

        <StatCard
          label="Approved"
          value={dashboardStats.approved}
          hint="Projects already approved."
          icon={<CheckCircle size={20} />}
        />
      </DashboardGrid>

      <div className="grid gap-7 sm:gap-6 xl:grid-cols-[1fr_22rem]">
        <DashboardPanel>
          <SectionHeader
            title="Supervisor Work Queue"
            description="Recent assigned teams that need your attention."
            action={
              <Button variant="outline" onClick={() => openProjectsView('all')}>
                View All Projects
                <ChevronRight size={16} />
              </Button>
            }
          />

          {recentProjects.length === 0 ? (
            <EmptyState
              title="No projects found"
              description="Assigned projects will appear here when students select you as supervisor."
              icon={<FileText size={28} />}
            />
          ) : (
            <div className="space-y-3">
              {recentProjects.map((project) => (
                <button
                  key={project._id}
                  type="button"
                  onClick={() => setSelectedProject(project)}
                  className="flex w-full flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-left transition-colors hover:bg-[var(--color-surface)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarBadge name={getMemberNames(project)} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--color-text)]">
                        {getMemberNames(project)}
                      </p>
                      <p className="truncate text-xs text-[var(--color-text-muted)]">
                        {project.projectTitle || 'Project details not submitted yet'}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={getStatusVariant(project.status)}>{project.status || 'Pending'}</Badge>
                    <ChevronRight size={16} className="text-[var(--color-text-muted)]" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel>
          <SectionHeader
            title="Supervisor Tools"
            description="Quick actions for communication and reporting."
          />

          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                Your Migration Code
              </p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-[var(--color-text)]">
                {myMigrationCode}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
                Share this only when another supervisor needs to transfer a team to you.
              </p>
            </div>

            <div className="grid gap-2">
              <BroadcastWidget isDarkMode={isDarkMode} theme={theme} showDialog={showDialog} />

              <Button variant="outline" onClick={handleExportPDF} disabled={isExporting}>
                {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                {isExporting ? 'Exporting...' : 'Export Filtered Excel'}
              </Button>
            </div>
          </div>
        </DashboardPanel>
      </div>
    </div>
  );

  const renderProjects = () => (
    <DashboardPanel className="flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      <SectionHeader
        title={projectQueueTitle}
        description={projectQueueDescription}
        action={
          <div className="flex flex-wrap gap-2">
            {projectQueueFilter !== 'all' && (
              <Button variant="outline" onClick={() => setProjectQueueFilter('all')}>
                Clear queue filter
              </Button>
            )}
            <Button variant="outline" onClick={handleExportPDF} disabled={isExporting}>
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid shrink-0 gap-3 lg:grid-cols-[1fr_14rem]">
        <StyledInput
          icon={Search}
          value={projectSearch}
          onChange={(event: any) => setProjectSearch(event.target.value)}
          placeholder="Search by student, roll number, title, domain, status..."
        />

        <Select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)}>
          <option value="All">All Batches</option>
          {uniqueBatches.map((batch) => (
            <option key={batch} value={batch}>
              {batch}
            </option>
          ))}
        </Select>
      </div>

        {filteredProjects.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <EmptyState
              title={emptyProjectState.title}
              description={emptyProjectState.description}
              icon={<FileText size={28} />}
            />
          </div>
        ) : (
          <div className="portal-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            <DashboardGrid columns="three" className="pb-1">
              {filteredProjects.map(renderProjectCard)}
            </DashboardGrid>
          </div>
        )}
    </DashboardPanel>
  );

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

  const selectedPdfKey = getSafePdfKey(selectedProject?.pdfUrl);

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
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'projects' && (
          <div className="min-h-0 lg:h-full">
            {renderProjects()}
          </div>
        )}
      </DashboardShell>

      <Dialog
        open={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        title={getMemberNames(selectedProject)}
        description={selectedProject ? `${getMemberRollNumbers(selectedProject)} · ${getProgramName(getProjectProgram(selectedProject))} · ${selectedProject.batch || 'No batch'} · ${selectedProject.semester || 'No semester'}` : ''}
        size="xl"
        footer={
          selectedProject ? (
            <>
              <Button variant="outline" onClick={() => setSelectedProject(null)}>
                Close
              </Button>

              <Button
                variant="success"
                disabled={
                  !selectedProject.projectTitle ||
                  !selectedProject.pdfUrl ||
                  selectedProject.status === 'Approved' ||
                  isProcessingAction
                }
                onClick={() => handleAction(selectedProject.triggerStudentId, 'Approved')}
              >
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle size={16} />}
                Approve
              </Button>

              <Button
                variant="accent"
                disabled={
                  !selectedProject.projectTitle ||
                  !selectedProject.pdfUrl ||
                  selectedProject.status === 'Changes Requested' ||
                  isProcessingAction
                }
                onClick={() => handleAction(selectedProject.triggerStudentId, 'Changes Requested')}
              >
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                Request Changes
              </Button>

              <Button
                variant="danger"
                disabled={
                  !selectedProject.projectTitle ||
                  !selectedProject.pdfUrl ||
                  selectedProject.status === 'Rejected' ||
                  isProcessingAction
                }
                onClick={() => handleAction(selectedProject.triggerStudentId, 'Rejected')}
              >
                {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <UserMinus size={16} />}
                Reject
              </Button>
            </>
          ) : null
        }
      >
        {selectedProject && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Status
                </p>
                <div className="mt-2">
                  <Badge variant={getStatusVariant(selectedProject.status)}>
                    {selectedProject.status || 'Pending'}
                  </Badge>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Batch
                </p>
                <p className="mt-2 text-sm font-bold text-[var(--color-text)]">
                  {selectedProject.batch || 'Not assigned'}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Team Size
                </p>
                <p className="mt-2 text-sm font-bold text-[var(--color-text)]">
                  {Array.isArray(selectedProject.members) ? selectedProject.members.length : 0}{' '}
                  {Array.isArray(selectedProject.members) && selectedProject.members.length === 1
                    ? 'student'
                    : 'students'}
                </p>
                {Array.isArray(selectedProject.members) && selectedProject.members.length > 2 ? (
                  <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
                    Legacy 3-member team · all existing members preserved
                  </p>
                ) : null}
              </div>
            </div>

            <ProjectTimeline currentStage={selectedProject.stage || 'PROPOSAL'} />

            <DashboardPanel>
              <SectionHeader
                title="Project Details"
                description="Submitted project information from the team."
                action={
                  selectedPdfKey ? (
                    <a
                      href={`/api/read-pdf?url=${encodeURIComponent(selectedPdfKey)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
                    >
                      <ExternalLink size={16} />
                      View PDF
                    </a>
                  ) : null
                }
              />

              {selectedProject.projectTitle ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                      Title
                    </p>
                    <h3 className="mt-2 text-lg font-bold leading-7 text-[var(--color-text)]">
                      {selectedProject.projectTitle}
                    </h3>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {selectedProject.domain && (
                      <Badge variant="accent">
                        <Globe size={13} />
                        {selectedProject.domain}
                      </Badge>
                    )}

                    {selectedProject.tools && (
                      <Badge variant="muted">
                        <Wrench size={13} />
                        {selectedProject.tools}
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm leading-6 text-[var(--color-text-muted)]">
                    {selectedProject.projectDesc || 'No project description provided.'}
                  </p>
                </div>
              ) : (
                <EmptyState
                  title="Project details not submitted"
                  description="This team has not submitted its title, description, tools, and PDF yet."
                  icon={<FileText size={28} />}
                />
              )}
            </DashboardPanel>

            <DashboardPanel>
              <SectionHeader
                title="Team Members"
                description="Students currently attached to this project."
              />

              <div className="grid gap-3 md:grid-cols-2">
                {(selectedProject.members || []).map((member: any) => (
                  <div
                    key={member._id || member.rollNo || member.email}
                    className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"
                  >
                    <AvatarBadge name={member.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--color-text)]">
                        {member.name || 'Student'}
                      </p>
                      <p className="truncate text-xs text-[var(--color-text-muted)]">
                        {member.rollNo || member.email || 'No identifier'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardPanel>

            <DashboardPanel>
              <SectionHeader
                title="Voice Notes"
                description="Communicate with the team through short project voice notes."
              />

              <VoiceChat
                projectId={selectedProject._id}
                currentUserId={supervisorId}
                theme={theme}
                isDarkMode={isDarkMode}
              />
            </DashboardPanel>

            <DashboardPanel>
              <SectionHeader
                title="Supervisor Management"
                description="Select a student from the team and migrate them individually."
              />

              <div className="grid gap-4">
                {/* Dropdown to select student */}
                <div>
                  <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                    Select Student to Migrate
                  </label>
                  <select
                    value={migrationStudentId}
                    onChange={(e) => setMigrationStudentId(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                  >
                    {(selectedProject?.members || []).map((member: any) => (
                      <option key={member._id} value={member._id}>
                        {member.name} ({member.rollNo || member.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Migration code input and action buttons */}
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                  <StyledInput
                    value={migrationInput[selectedProject._id] || ''}
                    onChange={(event: any) =>
                      setMigrationInput((previous) => ({
                        ...previous,
                        [selectedProject._id]: event.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Enter target migration code"
                  />

                  <Button
                    variant="outline"
                    disabled={isProcessingAction || !migrationStudentId}
                    onClick={() => handleMigrate(migrationStudentId, selectedProject._id)}
                  >
                    {isProcessingAction ? <Loader2 className="animate-spin" size={16} /> : <ArrowRightLeft size={16} />}
                    Migrate Student
                  </Button>

                  <Button
                    variant="danger"
                    disabled={isProcessingAction}
                    onClick={() =>
                      handleRemoveTeam(
                        selectedProject.triggerStudentId,
                        getMemberNames(selectedProject)
                      )
                    }
                  >
                    <UserMinus size={16} />
                    Remove Team
                  </Button>
                </div>
              </div>
            </DashboardPanel>
          </div>
        )}
      </Dialog>
    </>
  );
};

export default SupervisorDashboard;