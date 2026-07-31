'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { AlertTriangle, Loader2, LogIn, Settings } from 'lucide-react';

import {
  Button,
  DashboardShell,
} from '../ui/SharedUI';
import FinePaymentPanel from '../student/FinePaymentPanel';
import DynamicFinePaymentPanel from '../student/DynamicFinePaymentPanel';
import StudentOverviewSection from '../student/StudentOverviewSection';
import StudentProjectSubmissionSection from '../student/StudentProjectSubmissionSection';
import StudentResourcesSection from '../student/StudentResourcesSection';
import StudentTeamSection from '../student/StudentTeamSection';
import {
  AcademicUpdateDialog,
  SupervisorChangeDialog,
  TemplatePreviewDialog,
} from '../student/StudentDashboardDialogs';
import type {
  StudentDashboardProps,
  WordTemplate,
} from '../student/studentDashboardTypes';
import { useStudentProjectDraft } from '../student/hooks/useStudentProjectDraft';
import { useStudentTemplates } from '../student/hooks/useStudentTemplates';
import { useStudentDashboardData } from '../student/hooks/useStudentDashboardData';
import { useStudentDashboardNavigation } from '../student/hooks/useStudentDashboardNavigation';
import { useStudentProjectSubmission } from '../student/hooks/useStudentProjectSubmission';
import {
  buildStudentDashboardViewModel,
  getStudentSecureMediaUrl as getSecureMediaUrl,
} from '../student/selectors/studentDashboardViewModel';
import { useStudentAcademicUpdate } from '../student/hooks/useStudentAcademicUpdate';
import { useStudentFineRefresh } from '../student/hooks/useStudentFineRefresh';
import { useStudentSupervisorActions } from '../student/hooks/useStudentSupervisorActions';
import { useStudentTeamActions } from '../student/hooks/useStudentTeamActions';
const StudentDashboard = ({ isDarkMode = false, session, showDialog }: StudentDashboardProps) => {
  const [isAnnouncementPanelOpen, setIsAnnouncementPanelOpen] = useState(true);

  const currentUserId = String((session.user as { id?: string }).id || '');
  const {
    title,
    setTitle,
    desc,
    setDesc,
    selectedDomains,
    legacyDomain,
    tools,
    setTools,
    file,
    restoreProjectDraft,
    handleDomainsChange,
    handleProjectFileChange,
    clearStoredProjectDraft,
    resetProjectDraft,
  } = useStudentProjectDraft(currentUserId);
  const {
    data,
    supervisors: localSups,
    headline,
    isLoading,
    refreshDashboard: fetchData,
    refreshSupervisors: fetchSupervisors,
  } = useStudentDashboardData({
    userId: currentUserId,
    restoreProjectDraft,
    showDialog,
  });
  const {
    me,
    supervisor,
    project,
    fineRestriction,
    isOwnFineRestricted,
    isFineRestricted,
    teamFineMessage,
    projectMembers,
    maxTeamSize,
    canShareInviteCode,
    canLeaveTeam,
    currentStage,
    currentProgramName,
    toolsList,
    savedDomainLabels,
    savedDomainText,
    pdfUrl,
    isUnassigned,
    canSubmitByStatus,
    canSubmit,
    isSupervisorChangeLocked,
    announcementItems,
  } = buildStudentDashboardViewModel(data, headline, tools);
  const hasUnresolvedDynamicFine = Boolean(data?.effectiveFineRestrictions?.sources?.length);
  const hasDynamicFine = data?.hasDynamicFineActivity === true || hasUnresolvedDynamicFine;
  const isPaymentOnly = data?.effectiveFineRestrictions?.loginMode === 'payment-only';
  const { activeTab, setActiveTab, navItems } = useStudentDashboardNavigation(
    Boolean(fineRestriction) || hasDynamicFine,
    isPaymentOnly,
    Boolean(fineRestriction) || hasUnresolvedDynamicFine
  );
  const {
    visibleTemplates,
    isFetchingTemplates,
    selectedTemplate,
    isCopyingTemplate,
    isCopied,
    loadTemplates,
    openTemplate,
    closeTemplateDialog,
    handleCopyTemplate,
    resetTemplates,
  } = useStudentTemplates({ currentStage, showDialog });
  useStudentFineRefresh({
    isFineRestricted,
    refreshDashboard: fetchData,
  });
  const {
    selectedSupervisorId,
    setSelectedSupervisorId,
    isSupervisorWarningOpen,
    isSubmitting: isSupervisorSubmitting,
    supervisorOptions,
    supervisorChangeOptions,
    selectedSupervisorName,
    handleAssignSupervisor,
    openSupervisorChangeDialog,
    closeSupervisorChangeDialog,
    handleConfirmSupervisorChange,
  } = useStudentSupervisorActions({
    userId: currentUserId,
    supervisors: localSups,
    currentSupervisorId: me?.supervisorId,
    isChangeLocked: isSupervisorChangeLocked,
    refreshDashboard: fetchData,
    refreshSupervisors: fetchSupervisors,
    resetProjectDraft,
    resetTemplates,
    showDialog,
  });
  const {
    inviteCodeInput,
    setInviteCodeInput,
    isSubmitting: isTeamSubmitting,
    handleJoinTeam,
    handleLeaveTeam,
    handleCopyInviteCode,
  } = useStudentTeamActions({
    inviteCode: project?.inviteCode,
    canLeaveTeam,
    refreshDashboard: fetchData,
    refreshSupervisors: fetchSupervisors,
    resetProjectDraft,
    resetTemplates,
    showDialog,
  });
  const {
    isAcademicDialogOpen,
    isAcademicWarningStep,
    setIsAcademicWarningStep,
    isAcademicUpdating,
    academicForm,
    setAcademicForm,
    batchOptions,
    openAcademicEditor,
    closeAcademicEditor,
    handleAcademicUpdate,
  } = useStudentAcademicUpdate({
    userId: currentUserId,
    currentProgram: me?.program,
    currentBatch: me?.batch,
    refreshDashboard: fetchData,
    refreshSupervisors: fetchSupervisors,
    resetProjectDraft,
    resetTemplates,
    showDialog,
  });
  const {
    isSubmitting: isProjectSubmitting,
    handleSubmitProject,
  } = useStudentProjectSubmission({
    userId: currentUserId,
    title,
    description: desc,
    selectedDomains,
    tools,
    file,
    existingPdfUrl: pdfUrl,
    status: me?.status,
    isFineRestricted,
    isOwnFineRestricted,
    teamFineMessage,
    clearStoredProjectDraft,
    refreshDashboard: fetchData,
    openFineTab: () => setActiveTab('fine'),
    showDialog,
  });
  const isSubmitting =
    isProjectSubmitting || isSupervisorSubmitting || isTeamSubmitting;

  const handleOpenTemplate = async (template?: WordTemplate) => {
    if (!template) {
      await loadTemplates();
      setActiveTab('resources');
      return;
    }
    openTemplate(template);
  };
  if (isLoading) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center">
        <Loader2 className="mb-4 animate-spin text-[var(--color-accent)]" size={36} />
        <p className="text-sm font-bold text-[var(--color-text-muted)]">
          Loading student workspace...
        </p>
      </div>
    );
  }

  return (
    <>
      <DashboardShell
        title={`Good day, ${me?.name || session?.user?.name || 'Student'}`}
        description={`Final Year Project · ${currentProgramName} · ${me?.batch || 'Batch not set'}`}
        navItems={navItems}
        user={{
          name: me?.name || session?.user?.name || 'Student',
          role: `${me?.program || 'Student'} · ${me?.batch || 'No batch'}`,
        }}
        actions={
          <div className="grid gap-2 sm:flex">
            {!isPaymentOnly && (
              <Button variant="outline" onClick={openAcademicEditor}>
                <Settings size={16} />
                Academic Info
              </Button>
            )}

            <Button
              variant="danger"
              onClick={() => {
                void clearStoredProjectDraft().finally(() => {
                  void signOut({ redirect: false });
                });
              }}
            >
              <LogIn size={16} className="rotate-180" />
              Logout
            </Button>
          </div>
        }
      >
        {hasUnresolvedDynamicFine && activeTab !== 'fine' && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-bold">
              <AlertTriangle size={18} />
              You have an unresolved fine. Review the amount, restrictions, and payment status.
            </p>
            <Button variant="outline" onClick={() => setActiveTab('fine')}>Open Fine Status</Button>
          </div>
        )}
        {activeTab === 'overview' && (
          <StudentOverviewSection
            me={me}
            supervisor={supervisor}
            projectId={project?._id}
            announcementItems={announcementItems}
            isAnnouncementPanelOpen={isAnnouncementPanelOpen}
            onToggleAnnouncements={() => setIsAnnouncementPanelOpen((previous) => !previous)}
            currentStage={currentStage}
            projectMembers={projectMembers}
            savedDomainLabels={savedDomainLabels}
            savedDomainText={savedDomainText}
            toolsList={toolsList}
            getSecureMediaUrl={getSecureMediaUrl}
            onOpenProject={() => setActiveTab('project')}
            onOpenTeam={() => setActiveTab('team')}
          />
        )}
        {activeTab === 'project' && (
          <StudentProjectSubmissionSection
            pdfUrl={pdfUrl}
            pdfHref={getSecureMediaUrl(pdfUrl)}
            isFineRestricted={isFineRestricted}
            teamFineMessage={teamFineMessage}
            isOwnFineRestricted={isOwnFineRestricted}
            onOpenFine={() => setActiveTab('fine')}
            canSubmitByStatus={canSubmitByStatus}
            status={me?.status}
            onSubmit={handleSubmitProject}
            title={title}
            onTitleChange={setTitle}
            selectedDomains={selectedDomains}
            legacyDomain={legacyDomain}
            onDomainsChange={handleDomainsChange}
            tools={tools}
            onToolsChange={setTools}
            description={desc}
            onDescriptionChange={setDesc}
            canSubmit={canSubmit}
            file={file}
            onFileChange={(nextFile) => void handleProjectFileChange(nextFile)}
            isSubmitting={isSubmitting}
          />
        )}
        {activeTab === 'fine' && fineRestriction && !hasDynamicFine && (
          <FinePaymentPanel restriction={fineRestriction} onRefresh={fetchData} />
        )}
        {activeTab === 'fine' && hasDynamicFine && (
          <DynamicFinePaymentPanel />
        )}
        {activeTab === 'team' && (
          <StudentTeamSection
            projectMembers={projectMembers}
            maxTeamSize={maxTeamSize}
            canShareInviteCode={canShareInviteCode}
            inviteCode={project?.inviteCode}
            projectId={project?._id}
            isUnassigned={isUnassigned}
            supervisorOptions={supervisorOptions}
            selectedSupervisorId={selectedSupervisorId}
            onSupervisorChange={setSelectedSupervisorId}
            isSubmitting={isSubmitting}
            onAssignSupervisor={handleAssignSupervisor}
            inviteCodeInput={inviteCodeInput}
            onInviteCodeChange={setInviteCodeInput}
            onJoinTeam={handleJoinTeam}
            canLeaveTeam={canLeaveTeam}
            onLeaveTeam={handleLeaveTeam}
            onCopyInviteCode={handleCopyInviteCode}
            onOpenSupervisorChange={openSupervisorChangeDialog}
            isSupervisorChangeLocked={isSupervisorChangeLocked}
            supervisorChangeOptions={supervisorChangeOptions}
            currentUserId={currentUserId}
            isDarkMode={Boolean(isDarkMode)}
          />
        )}
        {activeTab === 'resources' && (
          <StudentResourcesSection
            currentStage={currentStage}
            isFetchingTemplates={isFetchingTemplates}
            onFetchTemplates={loadTemplates}
            visibleTemplates={visibleTemplates}
            onOpenTemplate={handleOpenTemplate}
            currentProgramName={currentProgramName}
            batch={me?.batch}
            onOpenAcademicEditor={openAcademicEditor}
          />
        )}
      </DashboardShell>

      <SupervisorChangeDialog
        open={isSupervisorWarningOpen}
        onClose={closeSupervisorChangeDialog}
        isSubmitting={isSubmitting}
        onConfirm={handleConfirmSupervisorChange}
        selectedSupervisorId={selectedSupervisorId}
        onSelectedSupervisorIdChange={setSelectedSupervisorId}
        options={supervisorChangeOptions}
        selectedSupervisorName={selectedSupervisorName}
        isDarkMode={Boolean(isDarkMode)}
      />

      <AcademicUpdateDialog
        open={isAcademicDialogOpen}
        onClose={closeAcademicEditor}
        isWarningStep={isAcademicWarningStep}
        onBack={() => setIsAcademicWarningStep(false)}
        onContinue={() => setIsAcademicWarningStep(true)}
        isUpdating={isAcademicUpdating}
        onConfirm={handleAcademicUpdate}
        academicForm={academicForm}
        onAcademicFormChange={setAcademicForm}
        batchOptions={batchOptions}
      />

      <TemplatePreviewDialog
        selectedTemplate={selectedTemplate}
        onClose={closeTemplateDialog}
        isCopyingTemplate={isCopyingTemplate}
        isCopied={isCopied}
        onCopy={handleCopyTemplate}
      />
    </>
  );
};

export default StudentDashboard;
