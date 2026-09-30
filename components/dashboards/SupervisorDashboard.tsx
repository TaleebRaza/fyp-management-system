'use client';

import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  ClipboardList,
  FileText,
  LayoutDashboard,
  Loader2,
  LogIn,
  MessagesSquare,
} from 'lucide-react';
import BroadcastWidget from './BroadcastWidget';
import SupervisorOverviewSection from '../supervisor/SupervisorOverviewSection';
import SupervisorProjectsSection from '../supervisor/SupervisorProjectsSection';
import SupervisorProjectDialog from '../supervisor/SupervisorProjectDialog';
import StudentMessagesPanel from '../messages/StudentMessagesPanel';
import VivaSessionWorkspace from '../supervisor/VivaSessionWorkspace';
import {
  useSupervisorExport,
  useSupervisorFeedback,
  useSupervisorProjectActions,
  useSupervisorProjectFilters,
  useSupervisorProjects,
  type SupervisorTab,
} from '../supervisor/hooks';
import type { SupervisorDashboardProps } from '../supervisor/supervisorDashboardTypes';
import { Button, DashboardShell } from '../ui';
import { useVivaAccessRestriction } from '../ui/dashboard/useVivaAccessRestriction';

const SupervisorDashboard = ({
  isDarkMode = false,
  theme,
  session,
  showDialog,
}: SupervisorDashboardProps) => {
  const [activeTab, setActiveTab] = useState<SupervisorTab>('overview');
  const [messageProjectId, setMessageProjectId] = useState<string | null>(null);
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
      label: 'Overview',
      section: 'Workspace',
      icon: <LayoutDashboard size={16} />,
      active: activeTab === 'overview',
      onClick: () => setActiveTab('overview'),
    },
    {
      id: 'projects',
      label: 'Assigned Projects',
      section: 'Workspace',
      icon: <FileText size={16} />,
      active: activeTab === 'projects',
      badge: projects.length,
      onClick: filters.openProjectsFromSidebar,
    },
    {
      id: 'messages',
      label: 'Student Messages',
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
  ];

  return (
    <>
      <DashboardShell
        title="Supervisor Dashboard"
        description="Review projects, manage teams, and run Viva sessions."
        navItems={navItems}
        className={`lg:h-[calc(100vh-7.5rem)] lg:min-h-0 [&>div]:lg:h-full [&>div]:lg:min-h-0 ${activeTab === 'projects' ? '[&>div>div>main]:lg:overflow-hidden' : ''}`}
        user={{ name: supervisorName, role: `Supervisor · Code ${myMigrationCode}` }}
        actions={
          <div className="flex gap-2">
            <BroadcastWidget isDarkMode={isDarkMode} theme={theme} />
            <Button variant="danger" onClick={() => signOut({ redirect: false })}>
              <LogIn size={16} className="rotate-180" />Logout
            </Button>
          </div>
        }
      >
        {activeTab === 'overview' && (
          <SupervisorOverviewSection
            stats={filters.dashboardStats}
            recentProjects={filters.recentProjects}
            myMigrationCode={myMigrationCode}
            isDarkMode={isDarkMode}
            theme={theme}
            isExporting={isExporting}
            onExport={exportProjects}
            onOpenProjects={filters.openProjectsView}
            onOpenProject={actions.openProject}
          />
        )}

        {activeTab === 'projects' && (
          <div className="min-h-0 lg:h-full">
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

        {activeTab === 'messages' && (
          <StudentMessagesPanel
            isDarkMode={isDarkMode}
            description="Messages sent directly to you by students on your assigned projects."
            onOpenProject={openMessageProject}
          />
        )}
        {activeTab === 'viva' && <VivaSessionWorkspace />}
      </DashboardShell>

      <SupervisorProjectDialog
        project={actions.selectedProject}
        onClose={actions.closeProject}
        isProcessingAction={actions.isProcessingAction}
        onAction={actions.handleAction}
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
    </>
  );
};

export default SupervisorDashboard;
