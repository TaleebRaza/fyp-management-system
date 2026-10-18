'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { signOut } from 'next-auth/react';
import {
  ClipboardList,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Loader2,
  MessagesSquare,
} from 'lucide-react';
import BroadcastWidget from './BroadcastWidget';
import SupervisorOverviewSection from '../supervisor/SupervisorOverviewSection';
import SupervisorProjectsSection from '../supervisor/SupervisorProjectsSection';
import SupervisorProjectDialog from '../supervisor/SupervisorProjectDialog';
import SupervisorHelpPanel from '../supervisor/SupervisorHelpPanel';
import {
  useSupervisorExport,
  useSupervisorFeedback,
  useSupervisorProjectActions,
  useSupervisorProjectFilters,
  useSupervisorProjects,
  type SupervisorTab,
} from '../supervisor/hooks';
import type { SupervisorDashboardProps } from '../supervisor/supervisorDashboardTypes';
import { DashboardShell } from '../ui';
import { useVivaAccessRestriction } from '../ui/dashboard/useVivaAccessRestriction';

const StudentMessagesPanel = dynamic(() => import('../messages/StudentMessagesPanel'), {
  loading: () => <p role="status">Loading messages...</p>,
});
const VivaSessionWorkspace = dynamic(() => import('../supervisor/VivaSessionWorkspace'), {
  loading: () => <p role="status">Loading Viva workspace...</p>,
});

const SupervisorDashboard = ({
  isDarkMode = false,
  onToggleTheme,
  theme,
  session,
  showDialog,
}: SupervisorDashboardProps) => {
  const [activeTab, setActiveTab] = useState<SupervisorTab>('overview');
  const [messageProjectId, setMessageProjectId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const supervisorName = session?.user?.name || 'Supervisor';
  const supervisorId = String((session.user as { id?: string }).id || '');

  useVivaAccessRestriction(showDialog);

  const { notify, requestConfirmation, requestRemarks } = useSupervisorFeedback(showDialog);
  const { projects, migrationCode: myMigrationCode, isLoading, refreshProjects } = useSupervisorProjects({ supervisorId, notify });
  const filters = useSupervisorProjectFilters({ projects, activeTab, setActiveTab });
  const { isExporting, exportProjects } = useSupervisorExport({
    projects,
    supervisorName,
    batchFilter: filters.batchFilter,
    programFilter: filters.programFilter,
    notify,
  });
  const actions = useSupervisorProjectActions({ notify, requestConfirmation, requestRemarks, refreshProjects });

  const openMessageProject = (projectId: string) => {
    if (!projects.some((project) => project._id === projectId)) return;
    setMessageProjectId(projectId);
    filters.showAllProjects();
  };

  useEffect(() => {
    if (activeTab !== 'projects' || !messageProjectId || !filters.filteredProjects.some((project) => project._id === messageProjectId)) return;

    const frame = window.requestAnimationFrame(() => {
      const projectCard = document.getElementById(`project-${messageProjectId}`);
      projectCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      projectCard?.focus({ preventScroll: true });
      setMessageProjectId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, filters.filteredProjects, messageProjectId]);

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <Loader2 className="mb-4 animate-spin text-[var(--color-accent)]" size={36} />
        <p className="text-sm font-bold text-[var(--color-text-muted)]">Loading supervisor workspace...</p>
      </div>
    );
  }

  const navItems = [
    {
      id: 'overview',
      label: 'Home',
      section: 'Workspace',
      icon: <LayoutDashboard size={16} />,
      active: activeTab === 'overview',
      onClick: () => setActiveTab('overview'),
    },
    {
      id: 'projects',
      label: 'Assigned Projects',
      mobileLabel: 'Projects',
      section: 'Workspace',
      icon: <FileText size={16} />,
      active: activeTab === 'projects',
      badge: projects.length,
      onClick: filters.openProjectsFromSidebar,
    },
    {
      id: 'messages',
      label: 'Communication',
      mobileLabel: 'Messages',
      section: 'Communication',
      icon: <MessagesSquare size={16} />,
      active: activeTab === 'messages',
      onClick: () => setActiveTab('messages'),
    },
    {
      id: 'viva',
      label: 'Viva Sessions',
      section: 'Assessment',
      icon: <ClipboardList size={16} />,
      active: activeTab === 'viva',
      onClick: () => setActiveTab('viva'),
    },
    {
      id: 'help',
      label: 'Help',
      section: 'Support',
      icon: <HelpCircle size={16} />,
      onClick: () => setHelpOpen(true),
    },
  ];

  return (
    <>
      <DashboardShell
        title="Supervisor Dashboard"
        description="Review projects, manage teams, and run Viva sessions."
        navItems={navItems}
        mobilePrimaryIds={['overview', 'projects', 'messages']}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        showHomeSignOut={activeTab === 'overview'}
        user={{ name: supervisorName }}
        onSignOut={() => void signOut({ redirect: false })}
      >
        {activeTab === 'overview' && (
          <SupervisorOverviewSection
            stats={filters.dashboardStats}
            migrationCode={myMigrationCode}
            onOpenProjects={filters.openProjectsView}
            onOpenViva={() => setActiveTab('viva')}
          />
        )}

        {activeTab === 'projects' && (
          <div>
            <SupervisorProjectsSection
              title={filters.projectQueueTitle}
              description={filters.projectQueueDescription}
              queueFilter={filters.projectQueueFilter}
              onClearQueueFilter={() => filters.setProjectQueueFilter('all')}
              isExporting={isExporting}
              onExport={exportProjects}
              search={filters.projectSearch}
              onSearchChange={filters.setProjectSearch}
              filterValue={filters.batchFilter}
              onFilterChange={filters.setBatchFilter}
              filterOptions={filters.uniqueBatches}
              filterLabel="Batch"
              secondaryFilterValue={filters.programFilter}
              onSecondaryFilterChange={filters.setProgramFilter}
              secondaryFilterOptions={filters.uniquePrograms}
              secondaryFilterLabel="Program"
              projects={filters.filteredProjects}
              emptyState={filters.emptyProjectState}
              onOpenProject={actions.openProject}
              readOnly={filters.projectQueueFilter === 'approved'}
              highlightedProjectId={messageProjectId}
            />
          </div>
        )}

        {activeTab === 'messages' && <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
            <div><h2 className="text-base font-semibold">Announcements</h2><p className="mt-1 text-sm text-[var(--color-text-muted)]">Send a text or voice update to your assigned students.</p></div>
            <BroadcastWidget isDarkMode={isDarkMode} theme={theme} />
          </div>
          <StudentMessagesPanel isDarkMode={isDarkMode} description="Messages sent directly to you by students on your assigned projects." onOpenProject={openMessageProject} />
        </div>}
        {activeTab === 'viva' && <VivaSessionWorkspace />}
      </DashboardShell>

      <SupervisorProjectDialog
        key={`${actions.selectedProject?._id || 'closed'}-${actions.progressionRequestId}`}
        project={actions.selectedProject}
        onClose={actions.closeProject}
        isProcessingAction={actions.isProcessingAction}
        onAction={actions.handleAction}
        onProgress={actions.handleProgress}
        progressionRequestId={actions.progressionRequestId}
        management={{
          migrationStudentId: actions.migrationStudentId,
          onMigrationStudentChange: actions.setMigrationStudentId,
          migrationCode: actions.migrationCode,
          onMigrationCodeChange: actions.setSelectedMigrationCode,
          onMigrate: () => void actions.handleMigrate(),
          onExpandTeam: actions.handleExpandTeam,
          onRemoveTeam: actions.handleRemoveTeam,
        }}
      />
      <SupervisorHelpPanel open={helpOpen} topic="projects" onClose={() => setHelpOpen(false)} />
    </>
  );
};

export default SupervisorDashboard;
