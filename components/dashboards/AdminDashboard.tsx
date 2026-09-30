'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { signOut } from 'next-auth/react';
import {
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  MessagesSquare,
  PauseCircle,
  ScrollText,
  Users,
} from 'lucide-react';

import { Button, DashboardShell, VivaWorkspaceShell } from '../ui';
import RegistrationControlPanel from '../admin/RegistrationControlPanel';
import FineManagementPanel from '../admin/FineManagementPanel';
import AdminOverviewSection from '../admin/AdminOverviewSection';
import AdminHeadlineSection from '../admin/AdminHeadlineSection';
import AdminStudentsSection from '../admin/AdminStudentsSection';
import StudentMessagesPanel from '../messages/StudentMessagesPanel';
import AdminSupervisorsSection, {
  SupervisorSlotEditorDialog,
} from '../admin/AdminSupervisorsSection';
import { AdminReportsDialog } from '../admin/AdminReports';
import type { AdminDashboardProps } from '../admin/adminDashboardTypes';
import {
  useAdminEmailUpdate,
  useAdminHeadline,
  useAdminProjectReviewPrefetch,
  useAdminReports,
  useAdminStudents,
  useAdminSupervisors,
} from '../admin/hooks';

const loadAdminProjectReviewsPanel = () =>
  import('../admin/AdminProjectReviewsPanel');

const AdminProjectReviewsPanel = dynamic(loadAdminProjectReviewsPanel, {
  loading: () => (
    <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
      Loading project reviews...
    </div>
  ),
});

const AdminVivaSection = dynamic(() => import('../admin/AdminVivaSection'), {
  loading: () => (
    <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
      Loading Viva configuration...
    </div>
  ),
});

const AdminActivityLogsPanel = dynamic(
  () => import('../admin/AdminActivityLogsPanel'),
  {
    loading: () => (
      <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
        Loading activity logs...
      </div>
    ),
  }
);

type AdminTab =
  | 'overview'
  | 'supervisors'
  | 'students'
  | 'messages'
  | 'reviews'
  | 'logs'
  | 'registration'
  | 'fines'
  | 'portal';

const AdminDashboard = ({
  session,
  showDialog,
  isDarkMode = false,
  onToggleTheme,
  registrationPolicy,
  onRegistrationPolicyChange,
  portalPaused = false,
  portalPauseReason = '',
  onPortalPauseChange,
}: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isVivaView, setIsVivaView] = useState(false);
  const [isUpdatingPortal, setIsUpdatingPortal] = useState(false);
  const headline = useAdminHeadline(showDialog);
  const students = useAdminStudents(showDialog);
  const supervisors = useAdminSupervisors(
    showDialog,
    students.refreshStudents
  );
  const reports = useAdminReports(showDialog);

  const updatePortal = async (paused: boolean, reason = portalPauseReason) => {
        setIsUpdatingPortal(true);
        try {
          const response = await fetch('/api/admin/portal-status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paused, reason }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          onPortalPauseChange?.(result.paused, result.reason);
        } catch (error) {
          showDialog({
            title: 'Portal status not changed',
            message: error instanceof Error ? error.message : 'Please try again.',
          });
        } finally {
          setIsUpdatingPortal(false);
        }
  };

  const togglePortal = () => {
    showDialog({
      type: portalPaused ? 'confirm' : 'prompt',
      title: portalPaused ? 'Reopen the portal?' : 'Pause the portal?',
      message: portalPaused
        ? 'Students and supervisors will regain access immediately.'
        : 'Enter the maintenance, feature addition, or feature removal message everyone should see.',
      defaultValue: portalPauseReason,
      placeholder: 'The portal is temporarily unavailable for maintenance.',
      onConfirm: (reason) => updatePortal(!portalPaused, reason),
    });
  };

  useAdminProjectReviewPrefetch(loadAdminProjectReviewsPanel);

  const handleUpdateEmail = useAdminEmailUpdate({
    showDialog,
    studentPage: students.page,
    updateStudentEmailLocally: students.updateStudentEmailLocally,
    updateSupervisorEmailLocally: supervisors.updateSupervisorEmailLocally,
    refreshStudents: students.refreshStudents,
    refreshSupervisors: supervisors.refreshSupervisors,
  });

  const navItems = [
    {
      id: 'overview',
      label: 'Home',
      section: 'Workspace',
      icon: <LayoutDashboard size={18} />,
      active: activeTab === 'overview',
      onClick: () => setActiveTab('overview'),
    },
    {
      id: 'supervisors',
      label: 'Supervisors',
      section: 'People',
      icon: <Users size={18} />,
      active: activeTab === 'supervisors',
      badge: supervisors.supervisors.length,
      onClick: () => setActiveTab('supervisors'),
    },
    {
      id: 'students',
      label: 'Students',
      section: 'People',
      icon: <GraduationCap size={18} />,
      active: activeTab === 'students',
      badge: students.pagination.total || students.students.length,
      onClick: () => setActiveTab('students'),
    },
    {
      id: 'reviews',
      label: 'Project Reviews',
      mobileLabel: 'Reviews',
      section: 'Projects',
      icon: <ClipboardCheck size={18} />,
      active: activeTab === 'reviews',
      onClick: () => setActiveTab('reviews'),
    },
    {
      id: 'viva',
      label: 'Viva',
      section: 'Projects',
      icon: <ClipboardList size={18} />,
      onClick: () => setIsVivaView(true),
    },
    {
      id: 'messages',
      label: 'Communication',
      section: 'Communication',
      icon: <MessagesSquare size={18} />,
      active: activeTab === 'messages',
      onClick: () => setActiveTab('messages'),
    },
    {
      id: 'registration',
      label: 'Registration',
      section: 'Operations',
      icon: <LockKeyhole size={18} />,
      active: activeTab === 'registration',
      badge: registrationPolicy?.isOpen === false ? 'Closed' : 'Open',
      onClick: () => setActiveTab('registration'),
    },
    {
      id: 'fines',
      label: 'Fines',
      section: 'Operations',
      icon: <CircleDollarSign size={18} />,
      active: activeTab === 'fines',
      onClick: () => setActiveTab('fines'),
    },
    {
      id: 'portal',
      label: 'Portal status',
      section: 'Operations',
      icon: <PauseCircle size={18} />,
      active: activeTab === 'portal',
      onClick: () => setActiveTab('portal'),
    },
    {
      id: 'reports',
      label: 'Reports',
      section: 'Insights & Audit',
      icon: <BarChart3 size={18} />,
      onClick: reports.openReports,
    },
    {
      id: 'logs',
      label: 'Logs',
      section: 'Insights & Audit',
      icon: <ScrollText size={18} />,
      active: activeTab === 'logs',
      onClick: () => setActiveTab('logs'),
    },
  ];

  if (isVivaView) {
    return (
      <VivaWorkspaceShell
        eyebrow="Viva administration"
        title="Manage Viva rounds"
        description="Set up rounds, panels, sessions, and result publication in one focused workspace."
        onExit={() => setIsVivaView(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
      >
        <AdminVivaSection />
      </VivaWorkspaceShell>
    );
  }

  return (
    <>
      <DashboardShell
        title="Admin workspace"
        description="Portal settings, activity, and management."
        navItems={navItems}
        mobilePrimaryIds={['overview', 'students', 'reviews']}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        showHomeSignOut={activeTab === 'overview'}
        user={{
          name: session?.user?.name || 'Administrator',
        }}
        onSignOut={() => void signOut({ redirect: false })}
      >
        {activeTab === 'overview' && (
          <AdminOverviewSection
              students={reports.data?.totals?.students}
              supervisors={reports.data?.totals?.supervisors}
              portalPaused={portalPaused}
              registrationPolicy={registrationPolicy}
              projects={reports.data?.totals?.projects}
              reviewQueue={reports.data?.totals?.reviewQueue}
              summaryLoading={reports.isLoading}
              summaryError={reports.summaryError}
              onOpenSupervisors={() => setActiveTab('supervisors')}
              onOpenStudents={() => setActiveTab('students')}
              onOpenReviews={() => setActiveTab('reviews')}
              onOpenRegistration={() => setActiveTab('registration')}
              onOpenPortal={() => setActiveTab('portal')}
              onOpenReports={reports.openReports}
          />
        )}

        {activeTab === 'supervisors' && (
          <div>
            <AdminSupervisorsSection
              newSupervisor={supervisors.newSupervisor}
              onNewSupervisorChange={
                supervisors.handleNewSupervisorChange
              }
              onAddSupervisor={supervisors.handleAddSupervisor}
              supervisors={supervisors.filteredSupervisors}
              totalSupervisors={supervisors.supervisors.length}
              search={supervisors.search}
              onSearchChange={supervisors.setSearch}
              onUpdateEmail={handleUpdateEmail}
              onEditSlots={supervisors.openSlotEditor}
              onToggleNotifications={supervisors.handleToggleNotifications}
              onDelete={supervisors.handleDeleteSupervisor}
            />
          </div>
        )}

        {activeTab === 'students' && (
          <div>
            <AdminStudentsSection
              students={students.students}
              search={students.search}
              onSearchChange={students.setSearch}
              studentFilter={students.studentFilter}
              onStudentFilterChange={students.handleStudentFilterChange}
              filterOptions={students.filterOptions}
              batchFilter={students.batchFilter}
              onBatchFilterChange={students.handleBatchFilterChange}
              batches={students.batches}
              isLoading={students.isLoading}
              pagination={students.pagination}
              page={students.page}
              onPageChange={students.handlePageChange}
              onPromoteBatch={students.handlePromoteBatch}
              onUpdateEmail={handleUpdateEmail}
              onUpdateProgram={students.handleUpdateProgram}
              onUpdateBatch={students.handleUpdateBatch}
              onToggleStatus={students.handleToggleStatus}
            />
          </div>
        )}

        {activeTab === 'reviews' && (
          <AdminProjectReviewsPanel showDialog={showDialog} />
        )}

        {activeTab === 'messages' && <div className="space-y-5">
          <AdminHeadlineSection
            headlineInput={headline.headlineInput}
            onHeadlineInputChange={headline.setHeadlineInput}
            currentHeadline={headline.currentHeadline}
            onBroadcast={headline.broadcastHeadline}
            onClear={headline.clearHeadline}
          />
          <StudentMessagesPanel isDarkMode={isDarkMode} />
        </div>}

        {activeTab === 'portal' && <section className="max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Portal status</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{portalPaused ? 'The portal is paused for students and supervisors.' : 'The portal is open to students and supervisors.'}</p>
          {portalPaused && portalPauseReason && <p className="mt-3 rounded-xl bg-[var(--color-surface-muted)] p-3 text-sm">{portalPauseReason}</p>}
          <Button className="mt-5" variant={portalPaused ? 'primary' : 'danger'} disabled={isUpdatingPortal} onClick={togglePortal}><PauseCircle size={16} />{portalPaused ? 'Reopen portal' : 'Pause portal'}</Button>
        </section>}

        {activeTab === 'logs' && <AdminActivityLogsPanel />}
        {activeTab === 'fines' && (
          <FineManagementPanel showDialog={showDialog} />
        )}
        {activeTab === 'registration' && (
          <RegistrationControlPanel
            initialPolicy={registrationPolicy}
            onPolicyChange={onRegistrationPolicyChange}
          />
        )}
      </DashboardShell>

      <SupervisorSlotEditorDialog
        supervisor={supervisors.slotEditorSupervisor}
        value={supervisors.slotEditorValue}
        onValueChange={supervisors.setSlotEditorValue}
        isSaving={supervisors.isSlotEditorSaving}
        onClose={supervisors.closeSlotEditor}
        onSave={supervisors.saveSupervisorExtraSlots}
      />

      <AdminReportsDialog
        open={reports.isOpen}
        onClose={reports.closeReports}
        isLoading={reports.isLoading}
        data={reports.data}
        selectedReportId={reports.selectedReportId}
        onSelectedReportChange={reports.setSelectedReportId}
        selectedReport={reports.selectedReport}
        rows={reports.rows}
        onRefresh={reports.refreshReports}
        onDownloadCsv={reports.downloadCsvReport}
        onDownloadHtml={reports.downloadHtmlReport}
        onOpenReport={reports.openReportInNewTab}
        ratingExportFilters={reports.ratingExportFilters}
        isDownloadingRatings={reports.isDownloadingRatings}
        onRatingRoundChange={reports.setRatingExportRound}
        onRatingMinimumChange={reports.setRatingExportMinimum}
        onDownloadRatings={reports.downloadProjectRatings}
      />
    </>
  );
};

export default AdminDashboard;
