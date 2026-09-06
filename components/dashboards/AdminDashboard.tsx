'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { signOut } from 'next-auth/react';
import {
  BarChart3,
  CircleDollarSign,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  MessagesSquare,
  Palette,
  PauseCircle,
  ScrollText,
  Users,
} from 'lucide-react';

import { Button, DashboardShell } from '../ui';
import RegistrationControlPanel from '../admin/RegistrationControlPanel';
import BrandingControlPanel from '../admin/BrandingControlPanel';
import FineManagementPanel from '../admin/FineManagementPanel';
import AdminOverviewSection from '../admin/AdminOverviewSection';
import AdminHeadlineSection from '../admin/AdminHeadlineSection';
import AdminStudentsSection from '../admin/AdminStudentsSection';
import StudentMessagesPanel from '../admin/StudentMessagesPanel';
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
import { buildAdminStats } from '../admin/selectors/adminDashboardSelectors';

const loadAdminProjectReviewsPanel = () =>
  import('../admin/AdminProjectReviewsPanel');

const AdminProjectReviewsPanel = dynamic(loadAdminProjectReviewsPanel, {
  loading: () => (
    <div className="flex min-h-[24rem] items-center justify-center text-sm font-bold text-[var(--color-text-muted)]">
      Loading project reviews...
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
  | 'branding';

const AdminDashboard = ({
  session,
  showDialog,
  isDarkMode = false,
  registrationPolicy,
  onRegistrationPolicyChange,
  portalPaused = false,
  portalPauseReason = '',
  onPortalPauseChange,
}: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
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

  const stats = useMemo(
    () =>
      buildAdminStats(
        students.students,
        students.pagination.activeTotal ?? students.pagination.total,
        supervisors.supervisors.length
      ),
    [
      students.pagination.activeTotal,
      students.pagination.total,
      students.students,
      supervisors.supervisors.length,
    ]
  );

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      section: 'Dashboard',
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
      section: 'Portal Operations',
      icon: <ClipboardCheck size={18} />,
      active: activeTab === 'reviews',
      onClick: () => setActiveTab('reviews'),
    },
    {
      id: 'messages',
      label: 'Messages',
      section: 'Portal Operations',
      icon: <MessagesSquare size={18} />,
      active: activeTab === 'messages',
      onClick: () => setActiveTab('messages'),
    },
    {
      id: 'registration',
      label: 'Registration',
      section: 'Portal Operations',
      icon: <LockKeyhole size={18} />,
      active: activeTab === 'registration',
      badge: registrationPolicy?.isOpen === false ? 'Closed' : 'Open',
      className:
        registrationPolicy?.isOpen === false
          ? 'border border-red-500/40 !bg-red-300/50 !text-red-950 hover:!bg-red-300/50 dark:!text-red-50'
          : 'border border-emerald-500/40 !bg-emerald-300/50 !text-emerald-950 hover:!bg-emerald-300/50 dark:!text-emerald-50',
      iconClassName:
        registrationPolicy?.isOpen === false
          ? '!text-red-900 dark:!text-red-100'
          : '!text-emerald-900 dark:!text-emerald-100',
      badgeClassName:
        registrationPolicy?.isOpen === false
          ? '!bg-red-950/10 !text-red-950 dark:!bg-red-50/10 dark:!text-red-50'
          : '!bg-emerald-950/10 !text-emerald-950 dark:!bg-emerald-50/10 dark:!text-emerald-50',
      onClick: () => setActiveTab('registration'),
    },
    {
      id: 'fines',
      label: 'Fines',
      section: 'Portal Operations',
      icon: <CircleDollarSign size={18} />,
      active: activeTab === 'fines',
      onClick: () => setActiveTab('fines'),
    },
    {
      id: 'branding',
      label: 'Branding',
      section: 'Portal Operations',
      icon: <Palette size={18} />,
      active: activeTab === 'branding',
      onClick: () => setActiveTab('branding'),
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

  return (
    <>
      <DashboardShell
        title="Admin Dashboard"
        description="Manage the complete FYP portal ecosystem."
        navItems={navItems}
        className={`lg:h-[calc(100vh-7.5rem)] lg:min-h-0 [&>div]:lg:h-full [&>div]:lg:min-h-0 ${
          activeTab === 'supervisors' || activeTab === 'students'
            ? '[&>div>div>main]:lg:overflow-hidden'
            : ''
        }`}
        user={{
          name: session?.user?.name || 'Administrator',
          role: 'Admin',
        }}
        actions={
          <div className="grid gap-2 sm:flex">
            <Button
              variant={portalPaused ? 'success' : 'danger'}
              disabled={isUpdatingPortal}
              onClick={togglePortal}
            >
              <PauseCircle size={16} />
              {portalPaused ? 'Reopen Portal' : 'Pause Portal'}
            </Button>
            <Button variant="outline" onClick={reports.openReports}>
              <BarChart3 size={16} />
              Reports
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
          <div className="space-y-7 sm:space-y-6">
            <AdminOverviewSection
              stats={stats}
              onOpenSupervisors={() => setActiveTab('supervisors')}
              onOpenStudents={() => setActiveTab('students')}
              onOpenReports={reports.openReports}
            />
            <AdminHeadlineSection
              headlineInput={headline.headlineInput}
              onHeadlineInputChange={headline.setHeadlineInput}
              currentHeadline={headline.currentHeadline}
              onBroadcast={headline.broadcastHeadline}
              onClear={headline.clearHeadline}
            />
          </div>
        )}

        {activeTab === 'supervisors' && (
          <div className="min-h-0 lg:h-full">
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
          <div className="min-h-0 lg:h-full">
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

        {activeTab === 'messages' && <StudentMessagesPanel isDarkMode={isDarkMode} />}

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
        {activeTab === 'branding' && <BrandingControlPanel />}
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
