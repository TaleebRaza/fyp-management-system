'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  CircleDollarSign,
  Download,
  FileText,
  LayoutDashboard,
  Loader2,
  LogIn,
  Settings,
  Users,
} from 'lucide-react';

import {
  Button,
  DashboardShell,
} from '../ui/SharedUI';
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
  AnnouncementItem,
  AvailableSupervisor,
  StudentDashboardData,
  StudentDashboardProps,
  WordTemplate,
} from '../student/studentDashboardTypes';
import {
  getStudentDashboard,
  getStudentHeadline,
  getStudentSupervisors,
  submitStudentProject,
  uploadStudentPdf,
} from '../student/api/studentDashboardApi';
import { createStudentProjectDraft } from '../student/draft/studentProjectDraft';
import { useStudentProjectDraft } from '../student/hooks/useStudentProjectDraft';
import { useStudentTemplates } from '../student/hooks/useStudentTemplates';
import { useStudentAcademicUpdate } from '../student/hooks/useStudentAcademicUpdate';
import { useStudentFineRefresh } from '../student/hooks/useStudentFineRefresh';
import { useStudentSupervisorActions } from '../student/hooks/useStudentSupervisorActions';
import { useStudentTeamActions } from '../student/hooks/useStudentTeamActions';
import { getStudentFineRestrictionState } from '../student/workflows/studentFineRestriction';
import { PROGRAM_MAP } from '../../config/appSettings';
import {
  formatProjectDomainLabels,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../config/projectDomains';
import { getTeamCapacity } from '../../lib/teamCapacity';

type StudentTab = 'overview' | 'project' | 'fine' | 'team' | 'resources';

const getProgramName = (program?: string) => {
  if (!program) return 'No program';
  return (PROGRAM_MAP as Record<string, string>)[program] || program;
};

const getSafePdfKey = (url?: string) => {
  if (!url) return '';
  return url.includes('.com/') ? url.split('.com/')[1] : url.replace(/^\//, '');
};

const getSecureMediaUrl = (url?: string) => {
  const key = getSafePdfKey(url);
  return key ? `/api/read-pdf?url=${encodeURIComponent(key)}` : '';
};

const splitTools = (tools?: string) => {
  return String(tools || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const StudentDashboard = ({ isDarkMode = false, session, showDialog }: StudentDashboardProps) => {
  const [activeTab, setActiveTab] = useState<StudentTab>('overview');
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [localSups, setLocalSups] = useState<AvailableSupervisor[]>([]);
  const [headline, setHeadline] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isProjectSubmitting, setIsProjectSubmitting] = useState(false);




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

  const me = data?.student;
  const supervisor = data?.supervisor;
  const project = data?.project;
  const supervisorBroadcast = data?.supervisorBroadcast || null;
  const {
    fineRestriction,
    isOwnFineRestricted,
    isFineRestricted,
    teamFineMessage,
  } = getStudentFineRestrictionState(data);
  if (activeTab === 'fine' && !fineRestriction) setActiveTab('project');

  const projectMembers = Array.isArray(project?.members) ? project.members : [];
  const maxTeamSize = getTeamCapacity(project?.maxTeamSize);
  const canShareInviteCode =
    Boolean(project?.inviteCode) && projectMembers.length < maxTeamSize;
  const canLeaveTeam = projectMembers.length > 1;
  const currentStage = project?.stage || 'PROPOSAL';
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
  const currentProgramName = getProgramName(me?.program);
  const toolsList = splitTools(me?.tools || tools);
  const savedDomainIds = useMemo(
    () =>
      normalizeProjectDomainIds(
        Array.isArray(project?.domains) && project.domains.length > 0
          ? project.domains
          : me?.domains,
        project?.domain || me?.domain
      ),
    [project?.domains, project?.domain, me?.domains, me?.domain]
  );
  const savedDomainLabels = useMemo(
    () => getProjectDomainLabels(savedDomainIds),
    [savedDomainIds]
  );
  const savedDomainText = formatProjectDomainLabels(
    savedDomainIds,
    project?.domain || me?.domain
  );
  const pdfUrl = me?.pdfUrl || project?.pdfUrl;

  const isUnassigned = !me?.supervisorId || me?.status === 'Unassigned';
  const canSubmitByStatus = ['Pending', 'Rejected', 'Changes Requested'].includes(me?.status || '');
  const canSubmit = canSubmitByStatus && !isFineRestricted;
  const isSupervisorChangeLocked =
    !isUnassigned && (project?.status === 'Approved' || currentStage !== 'PROPOSAL');

  const announcementItems = useMemo(() => {
    const items: AnnouncementItem[] = [];

    if (headline.trim()) {
      items.push({
        id: 'admin-announcement',
        source: 'Admin',
        title: 'Admin Announcement',
        type: 'text',
        content: headline.trim(),
        tone: 'admin',
      });
    }

    if (supervisorBroadcast?.type && supervisorBroadcast?.content) {
      items.push({
        id: 'supervisor-broadcast',
        source: supervisorBroadcast.supervisorName || supervisor?.name || 'Supervisor',
        title: supervisorBroadcast.type === 'audio' ? 'Supervisor Voice Broadcast' : 'Supervisor Broadcast',
        type: supervisorBroadcast.type,
        content: supervisorBroadcast.content,
        tone: 'supervisor',
        createdAt: supervisorBroadcast.createdAt,
      });
    }

    return items;
  }, [headline, supervisorBroadcast, supervisor?.name]);

  const fetchHeadline = useCallback(async () => {
    try {
      setHeadline(await getStudentHeadline());
    } catch (error) {
      console.error('Failed to fetch headline:', error);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const userId = (session.user as { id?: string }).id;
      if (!userId) return;

      const json = await getStudentDashboard(String(userId));
      setData(json);
      if (json?.student) {
        const serverProjectDraft = createStudentProjectDraft({
          title: json.student.projectTitle,
          desc: json.student.projectDesc,
          domains: normalizeProjectDomainIds(
            Array.isArray(json.project?.domains) && json.project.domains.length > 0
              ? json.project.domains
              : json.student.domains,
            json.project?.domain || json.student.domain || ''
          ),
          legacyDomain: json.project?.domain || json.student.domain || '',
          tools: json.student.tools,
        });
        await restoreProjectDraft(serverProjectDraft);
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      showDialog({
        title: 'Dashboard unavailable',
        message: 'Unable to load your dashboard right now. Please refresh and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [restoreProjectDraft, session.user, showDialog]);

  const fetchSupervisors = useCallback(async () => {
    try {
      setLocalSups(await getStudentSupervisors());
    } catch (error) {
      console.error('Supervisor fetch error:', error);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetchHeadline();
      void fetchData();
      void fetchSupervisors();
    });
  }, [fetchData, fetchHeadline, fetchSupervisors]);

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
  const isSubmitting =
    isProjectSubmitting || isSupervisorSubmitting || isTeamSubmitting;

  const uploadPdf = async (selectedFile: File) => {
    return uploadStudentPdf(selectedFile);
  };
  const handleSubmitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isFineRestricted) {
      if (isOwnFineRestricted) setActiveTab('fine');
      showDialog({
        title: isOwnFineRestricted ? 'Fine payment required' : 'Team fine pending',
        message: teamFineMessage,
      });
      return;
    }

    if (!canSubmitByStatus) {
      showDialog({
        title: 'Submission closed',
        message: `Submissions are closed while your project status is ${me?.status}.`,
      });
      return;
    }

    if (!title.trim() || !desc.trim() || selectedDomains.length === 0 || !tools.trim()) {
      showDialog({
        title: 'Missing project details',
        message: 'Complete the title, description, project domains, and tools before submitting.',
      });
      return;
    }

    if (!file && !pdfUrl) {
      showDialog({
        title: 'PDF required',
        message: 'Attach your project document as a PDF before submitting.',
      });
      return;
    }

    setIsProjectSubmitting(true);

    try {
      const upload = file ? await uploadPdf(file) : { url: pdfUrl, fileSize: 0 };
      const json = await submitStudentProject({
        id: currentUserId,
        title: title.trim(),
        desc: desc.trim(),
        domains: selectedDomains,
        tools: tools.trim(),
        pdfUrl: upload.url,
        fileSize: upload.fileSize,
      });

      await clearStoredProjectDraft();
      await fetchData();

      showDialog({
        title: 'Project submitted',
        message: json.message || 'Your project has been submitted for supervisor review.',
      });
    } catch (error) {
      showDialog({
        title: 'Submission failed',
        message: getErrorMessage(error, 'Unable to submit project right now.'),
      });
    } finally {
      setIsProjectSubmitting(false);
    }
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

  const navItems = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <LayoutDashboard size={18} />,
      active: activeTab === 'overview',
      onClick: () => setActiveTab('overview'),
    },
    {
      id: 'project',
      label: 'My Project',
      icon: <FileText size={18} />,
      active: activeTab === 'project',
      onClick: () => setActiveTab('project'),
    },
    ...(fineRestriction
      ? [
          {
            id: 'fine',
            label: 'Fine Payment',
            icon: <CircleDollarSign size={18} />,
            active: activeTab === 'fine',
            badge: 'Due',
            className:
              'border border-red-500/35 !bg-red-200/50 !text-red-950 hover:!bg-red-200/60 dark:!text-red-50',
            onClick: () => setActiveTab('fine'),
          },
        ]
      : []),
    { id: 'team', label: 'Team & Supervisor',
      icon: <Users size={18} />,
      active: activeTab === 'team',
      onClick: () => setActiveTab('team'),
    },
    {
      id: 'resources',
      label: 'Resources',
      icon: <Download size={18} />,
      active: activeTab === 'resources',
      onClick: () => setActiveTab('resources'),
    },
  ];

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
            <Button variant="outline" onClick={openAcademicEditor}>
              <Settings size={16} />
              Academic Info
            </Button>

            <Button variant="danger" onClick={() => signOut({ redirect: false })}>
              <LogIn size={16} className="rotate-180" />
              Logout
            </Button>
          </div>
        }
      >
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
        {activeTab === 'fine' && fineRestriction && (
          <FinePaymentPanel restriction={fineRestriction} onRefresh={fetchData} />
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
