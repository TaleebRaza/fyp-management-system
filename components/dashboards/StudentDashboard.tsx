'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { signOut } from 'next-auth/react';
import { Loader2 } from 'lucide-react';

import {
  DashboardShell,
  VivaWorkspaceShell,
} from '../ui';
import FinePaymentPanel from '../student/FinePaymentPanel';
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
import { refreshAfterSave } from '../refreshAfterSave';
import { updateStudentName } from '../student/api/studentWorkflowApi';
import { useVivaAccessRestriction } from '../ui/dashboard/useVivaAccessRestriction';

const StudentCommunicationSection = dynamic(() => import('../student/StudentCommunicationSection'), {
  loading: () => <p role="status">Loading messages...</p>,
});
const StudentVivaWorkspace = dynamic(() => import('../student/StudentVivaWorkspace'), {
  loading: () => <p role="status">Loading Viva workspace...</p>,
});

const StudentDashboard = ({ isDarkMode = false, onToggleTheme, session, showDialog }: StudentDashboardProps) => {
  const [isVivaView, setIsVivaView] = useState(false);

  useVivaAccessRestriction(showDialog);

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
    supervisorsLoaded,
    isLoadingSupervisors,
    supervisorsError,
    loadSupervisors,
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
    savedDomainIds,
    pdfUrl,
    isUnassigned,
    hasAssignedSupervisor,
    projectSubmissionComplete,
    projectSubmissionPendingReview,
    canSubmit,
    projectSubmissionsOpen,
    canEditProjectDetails,
    isSupervisorChangeLocked,
    announcementItems,
  } = buildStudentDashboardViewModel(data, headline, tools);
  const { activeTab, setActiveTab, navItems } = useStudentDashboardNavigation(Boolean(fineRestriction), () => setIsVivaView(true));
  const submissionTitle = canEditProjectDetails ? title : me?.projectTitle || '';
  const submissionDescription = canEditProjectDetails ? desc : me?.projectDesc || '';
  const submissionDomains = canEditProjectDetails ? selectedDomains : savedDomainIds;
  const submissionTools = canEditProjectDetails ? tools : me?.tools || '';
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
  const needsSupervisors = (activeTab === 'team' && isUnassigned) || isSupervisorWarningOpen;
  useEffect(() => {
    if (needsSupervisors && !supervisorsLoaded) {
      void loadSupervisors().catch(() => {});
    }
  }, [loadSupervisors, needsSupervisors, supervisorsLoaded]);
  const retrySupervisors = () => { void loadSupervisors().catch(() => {}); };

  const {
    inviteCodeInput,
    setInviteCodeInput,
    isSubmitting: isTeamSubmitting,
    handleJoinTeam,
    handleLeaveTeam,
    handleResetProject,
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
    title: submissionTitle,
    description: submissionDescription,
    selectedDomains: submissionDomains,
    tools: submissionTools,
    file,
    existingPdfUrl: pdfUrl,
    hasAssignedSupervisor,
    projectSubmissionComplete,
    canEditProjectDetails,
    projectSubmissionsOpen,
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

  const openNameEditor = () => {
    showDialog({
      type: 'prompt',
      title: 'Update name',
      message: 'You can change your name once per day. This will not affect your academic information or project.',
      defaultValue: me?.name || '',
      placeholder: 'Enter your full name',
      onConfirm: async (name = '') => {
        try {
          const response = await updateStudentName(name.trim());
          showDialog({ title: 'Name updated', message: response.message || 'Your name was updated.' });
          await refreshAfterSave(fetchData, (title, message) => showDialog({ title, message }));
        } catch (error) {
          showDialog({
            title: 'Name update blocked',
            message: error instanceof Error ? error.message : 'Could not update your name.',
          });
        }
      },
    });
  };

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

  if (isVivaView) {
    return (
      <VivaWorkspaceShell
        eyebrow="Your Viva"
        title="Viva schedule and results"
        description="See your panel, room, session time, and final grade after the panel completes your Viva."
        onExit={() => setIsVivaView(false)}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
      >
        <StudentVivaWorkspace results={data?.vivaResults || []} sessions={data?.vivaSessions || []} />
      </VivaWorkspaceShell>
    );
  }

  return (
    <>
      <DashboardShell
        title="Student workspace"
        description={`Final Year Project · ${currentProgramName} · ${me?.batch || 'Batch not set'}`}
        navItems={navItems}
        isDarkMode={isDarkMode}
        onToggleTheme={onToggleTheme}
        mobilePrimaryIds={['overview', 'project', 'messages']}
        user={{
          name: me?.name || session?.user?.name || 'Student',
        }}
        onSignOut={() => {
          void clearStoredProjectDraft().finally(() => {
            void signOut({ redirect: false });
          });
        }}
        showHomeSignOut={activeTab === 'overview'}
      >
        {data?.project?.vivaGraded && <p role="status" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm text-[var(--color-text)]">Your Viva grade has been saved. You can upload a new document. Project details, team membership, supervisor changes and project reset are locked until an administrator resets the project.</p>}
        {activeTab === 'overview' && (
          <StudentOverviewSection
            me={me}
            supervisor={supervisor}
            announcementItems={announcementItems}
            currentStage={currentStage}
            projectStatus={project?.status}
            onOpenProject={() => setActiveTab('project')}
            onOpenTeam={() => setActiveTab('team')}
            onOpenUpdates={() => setActiveTab('messages')}
            projectResetEnabled={!data?.project?.vivaGraded && data?.projectResetEnabled !== false}
            onResetProject={handleResetProject}
            isSubmitting={isSubmitting}
          />
        )}
        {activeTab === 'messages' && (
          <StudentCommunicationSection
            announcements={announcementItems}
            getSecureMediaUrl={getSecureMediaUrl}
            isDarkMode={Boolean(isDarkMode)}
            hasAssignedSupervisor={hasAssignedSupervisor}
            supervisorName={supervisor?.name}
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
            projectSubmissionsOpen={projectSubmissionsOpen}
            hasAssignedSupervisor={hasAssignedSupervisor}
            projectSubmissionComplete={projectSubmissionComplete}
            projectSubmissionPendingReview={projectSubmissionPendingReview}
            onSubmit={handleSubmitProject}
            title={submissionTitle}
            onTitleChange={setTitle}
            selectedDomains={submissionDomains}
            legacyDomain={legacyDomain}
            onDomainsChange={handleDomainsChange}
            tools={submissionTools}
            onToolsChange={setTools}
            description={submissionDescription}
            onDescriptionChange={setDesc}
            canEditProjectDetails={canEditProjectDetails}
            canSubmit={canSubmit}
            file={file}
            onFileChange={(nextFile) => void handleProjectFileChange(nextFile)}
            isSubmitting={isSubmitting}
            projectRatings={project?.ratings}
            currentStage={currentStage}
          />
        )}
        {activeTab === 'fine' && fineRestriction && (
          <FinePaymentPanel restriction={fineRestriction} onRefresh={fetchData} />
        )}
        {activeTab === 'team' && (
          <StudentTeamSection
            projectMembers={projectMembers}
            maxTeamSize={maxTeamSize}
            canShareInviteCode={canShareInviteCode}
            inviteCode={project?.inviteCode}
            isUnassigned={isUnassigned}
            supervisorName={supervisor?.name}
            supervisorsLoading={isLoadingSupervisors || (needsSupervisors && !supervisorsLoaded && !supervisorsError)}
            supervisorsError={supervisorsError}
            onRetrySupervisors={retrySupervisors}
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
          />
        )}
        {activeTab === 'resources' && (
          <StudentResourcesSection
            email={me?.email}
            showDialog={showDialog}
            currentStage={currentStage}
            isFetchingTemplates={isFetchingTemplates}
            onFetchTemplates={loadTemplates}
            visibleTemplates={visibleTemplates}
            onOpenTemplate={handleOpenTemplate}
            currentProgramName={currentProgramName}
            batch={me?.batch}
            academicChangesLocked={Boolean(data?.project?.vivaGraded)}
            onOpenAcademicEditor={openAcademicEditor}
            onOpenNameEditor={openNameEditor}
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
        supervisorsLoading={isLoadingSupervisors || (!supervisorsLoaded && !supervisorsError)}
        supervisorsError={supervisorsError}
        onRetrySupervisors={retrySupervisors}
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
