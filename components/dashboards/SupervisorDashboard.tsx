'use client';

import { useState } from 'react';
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
import SupervisorOverviewSection from '../supervisor/SupervisorOverviewSection';
import SupervisorProjectsSection from '../supervisor/SupervisorProjectsSection';
import SupervisorProjectDialog from '../supervisor/SupervisorProjectDialog';
import { getProgramName } from '../supervisor/SupervisorProjectCard';
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

const SupervisorDashboard = ({
  isDarkMode = false,
  theme,
  session,
  showDialog,
}: SupervisorDashboardProps) => {
  const [activeTab, setActiveTab] = useState<SupervisorTab>('overview');
  const supervisorName = session?.user?.name || 'Supervisor';
  const supervisorId = String((session.user as { id?: string }).id || '');

  const { notify, requestConfirmation, requestRemarks } =
    useSupervisorFeedback(showDialog);
  const {
    projects,
    migrationCode: myMigrationCode,
    isLoading,
    refreshProjects,
  } = useSupervisorProjects({ supervisorId, notify });
  const filters = useSupervisorProjectFilters({
    projects,
    activeTab,
    setActiveTab,
  });
  const { isExporting, exportProjects } = useSupervisorExport({
    supervisorId,
    supervisorName,
    batchFilter: filters.batchFilter,
    programFilter: filters.programFilter,
    notify,
  });
  const actions = useSupervisorProjectActions({
    notify,
    requestConfirmation,
    requestRemarks,
    refreshProjects,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <Loader2
          className="mb-4 animate-spin text-[var(--color-accent)]"
          size={36}
        />
        <p className="text-sm font-bold text-[var(--color-text-muted)]">
          Loading supervisor workspace...
        </p>
      </div>
    );
  }

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
      icon: filters.isProjectMenuExpanded ? (
        <ChevronDown size={18} />
      ) : (
        <FileText size={18} />
      ),
      active: activeTab === 'projects',
      badge: projects.length,
      onClick: filters.openProjectsFromSidebar,
    },
    ...(filters.isProjectMenuExpanded
      ? [
          {
            id: 'program-all',
            label: 'All Programs',
            icon: (
              <span className="ml-5 h-1.5 w-1.5 rounded-full bg-current" />
            ),
            active: activeTab === 'projects' && !filters.programFilter,
            badge: projects.length,
            onClick: filters.showAllPrograms,
          },
          ...filters.uniquePrograms.map((program) => ({
            id: `program-${program}`,
            label: getProgramName(program),
            icon: (
              <span className="ml-5 h-1.5 w-1.5 rounded-full bg-current" />
            ),
            active:
              activeTab === 'projects' && filters.programFilter === program,
            badge: filters.programProjectCounts[program],
            onClick: () => filters.showProgram(program),
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
          activeTab === 'projects'
            ? '[&>div>div>main]:lg:overflow-hidden'
            : ''
        }`}
        user={{
          name: supervisorName,
          role: `Supervisor · Code ${myMigrationCode}`,
        }}
        actions={
          <div className="grid gap-2 sm:flex">
            <BroadcastWidget
              isDarkMode={isDarkMode}
              theme={theme}
            />
            <Button
              variant="outline"
              onClick={exportProjects}
              disabled={isExporting}
            >
              {isExporting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Download size={16} />
              )}
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
            <Button
              variant="danger"
              onClick={() => signOut({ redirect: false })}
            >
              <LogIn size={16} className="rotate-180" />
              Logout
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
              projects={filters.filteredProjects}
              emptyState={filters.emptyProjectState}
              onOpenProject={actions.openProject}
            />
          </div>
        )}
      </DashboardShell>
      <SupervisorProjectDialog
        project={actions.selectedProject}
        onClose={actions.closeProject}
        isProcessingAction={actions.isProcessingAction}
        onAction={actions.handleAction}
        voiceNotes={{ currentUserId: supervisorId, theme, isDarkMode }}
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
