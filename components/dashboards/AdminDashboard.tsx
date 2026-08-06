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
  ScrollText,
  Users,
} from 'lucide-react';

import { Button, DashboardShell } from '../ui';
import RegistrationControlPanel from '../admin/RegistrationControlPanel';
import FineManagementPanel from '../admin/FineManagementPanel';
import AdminOverviewSection from '../admin/AdminOverviewSection';
import AdminHeadlineSection from '../admin/AdminHeadlineSection';
import AdminStudentsSection from '../admin/AdminStudentsSection';
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
  | 'reviews'
  | 'logs'
  | 'registration'
  | 'fines';

const AdminDashboard = ({
  session,
  showDialog,
  registrationPolicy,
  onRegistrationPolicyChange,
}: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const headline = useAdminHeadline(showDialog);
  const students = useAdminStudents(showDialog);
  const supervisors = useAdminSupervisors(
    showDialog,
    students.refreshStudents
  );
  const reports = useAdminReports(showDialog);

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
      icon: <LayoutDashboard size={18} />,
      active: activeTab === 'overview',
      onClick: () => setActiveTab('overview'),
    },
    {
      id: 'supervisors',
      label: 'Supervisors',
      icon: <Users size={18} />,
      active: activeTab === 'supervisors',
      badge: supervisors.supervisors.length,
      onClick: () => setActiveTab('supervisors'),
    },
    {
      id: 'students',
      label: 'Students',
      icon: <GraduationCap size={18} />,
      active: activeTab === 'students',
      badge: students.pagination.total || students.students.length,
      onClick: () => setActiveTab('students'),
    },
    {
      id: 'reviews',
      label: 'Project Reviews',
      icon: <ClipboardCheck size={18} />,
      active: activeTab === 'reviews',
      onClick: () => setActiveTab('reviews'),
    },
    {
      id: 'logs',
      label: 'Logs',
      icon: <ScrollText size={18} />,
      active: activeTab === 'logs',
      onClick: () => setActiveTab('logs'),
    },
    {
      id: 'registration',
      label: 'Registration',
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
      icon: <CircleDollarSign size={18} />,
      active: activeTab === 'fines',
      onClick: () => setActiveTab('fines'),
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 size={18} />,
      onClick: reports.openReports,
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
