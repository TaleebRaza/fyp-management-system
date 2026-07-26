'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  WordTemplate,
} from '../student/studentDashboardTypes';
import { PROGRAM_MAP } from '../../config/appSettings';
import {
  clearBrowserDraft,
  clearBrowserFileDraft,
  readBrowserDraft,
  readBrowserFileDraft,
  writeBrowserDraft,
  writeBrowserFileDraft,
} from '../../lib/browserDraftStorage';
import {
  formatProjectDomainLabels,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../config/projectDomains';
import { getTeamCapacity } from '../../lib/teamCapacity';

type StudentTab = 'overview' | 'project' | 'fine' | 'team' | 'resources';

type StudentProjectDraft = {
  title: string;
  desc: string;
  selectedDomains: string[];
  legacyDomain: string;
  tools: string;
};

const getStudentProjectDraftKey = (userId: string) =>
  `fyp-portal:student-project-draft:v1:${userId}`;

const hasStudentProjectDraftChanges = (
  draft: StudentProjectDraft,
  baseline: StudentProjectDraft | null
) => {
  if (!baseline) return true;
  return JSON.stringify(draft) !== JSON.stringify(baseline);
};

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

const StudentDashboard = ({ isDarkMode = false, session, showDialog }: any) => {
  const [activeTab, setActiveTab] = useState<StudentTab>('overview');
  const [data, setData] = useState<any>(null);
  const [localSups, setLocalSups] = useState<any[]>([]);
  const [headline, setHeadline] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [legacyDomain, setLegacyDomain] = useState('');
  const [tools, setTools] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [projectDraftBaseline, setProjectDraftBaseline] =
    useState<StudentProjectDraft | null>(null);
  const [isProjectDraftReady, setIsProjectDraftReady] = useState(false);

  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [isSupervisorWarningOpen, setIsSupervisorWarningOpen] = useState(false);

  const [isAcademicDialogOpen, setIsAcademicDialogOpen] = useState(false);
  const [isAcademicWarningStep, setIsAcademicWarningStep] = useState(false);
  const [isAcademicUpdating, setIsAcademicUpdating] = useState(false);
  const [academicForm, setAcademicForm] = useState({
    program: 'BSCS',
    batch: '',
  });

  const [cachedTemplates, setCachedTemplates] = useState<WordTemplate[]>([]);
  const [cachedTemplateStage, setCachedTemplateStage] = useState<string | null>(null);
  const [isFetchingTemplates, setIsFetchingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WordTemplate | null>(null);
  const [isCopyingTemplate, setIsCopyingTemplate] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const [isAnnouncementPanelOpen, setIsAnnouncementPanelOpen] = useState(true);

  const currentUserId = String((session?.user as any)?.id || '');
  const projectDraftKey = currentUserId ? getStudentProjectDraftKey(currentUserId) : '';
  const projectFileDraftKey = projectDraftKey ? `${projectDraftKey}:pdf` : '';

  const me = data?.student;
  const supervisor = data?.supervisor;
  const project = data?.project;
  const supervisorBroadcast = data?.supervisorBroadcast || null;
  const fineRestriction = data?.fineRestriction || null;
  const teamFineRestriction = data?.teamFineRestriction || fineRestriction;
  const isOwnFineRestricted = Boolean(fineRestriction?.active);
  const isFineRestricted = Boolean(teamFineRestriction?.active);
  const restrictedMember = teamFineRestriction?.member;
  const restrictedMemberLabel = `${restrictedMember?.name || 'A team member'}${
    restrictedMember?.rollNo ? ` (${restrictedMember.rollNo})` : ''
  }`;
  const teamFineMessage =
    teamFineRestriction?.isCurrentStudent !== false
      ? 'Project uploads are locked until the administrator verifies and clears your outstanding fine.'
      : `Project uploads are locked because ${restrictedMemberLabel} has an outstanding fine. The administrator must clear it before any team member can upload the proposal.`;

  useEffect(() => {
    if (activeTab === 'fine' && !fineRestriction) {
      setActiveTab('project');
    }
  }, [activeTab, fineRestriction]);

  const projectMembers = Array.isArray(project?.members) ? project.members : [];
  const maxTeamSize = getTeamCapacity(project?.maxTeamSize);
  const canShareInviteCode =
    Boolean(project?.inviteCode) && projectMembers.length < maxTeamSize;
  const currentStage = project?.stage || 'PROPOSAL';
  const visibleTemplates = cachedTemplateStage === currentStage ? cachedTemplates : [];
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
  const canSubmitByStatus = ['Pending', 'Rejected', 'Changes Requested'].includes(me?.status);
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

  const batchOptions = useMemo(() => {
    const options: string[] = [];
    const maxYear = new Date().getFullYear() + 1;

    for (let year = 2021; year <= maxYear; year++) {
      options.push(`Spring ${year}`);
      options.push(`Fall ${year}`);
    }

    return options;
  }, []);

  const supervisorOptions = useMemo(() => {
    return localSups
      .filter((supervisorItem) => !supervisorItem.isFull)
      .map((supervisorItem) => ({
        id: supervisorItem._id,
        label: `${supervisorItem.name} (${supervisorItem.filledSlots}/${supervisorItem.maxSlots} slots)`,
      }));
  }, [localSups]);

  const supervisorChangeOptions = useMemo(() => {
    const currentSupervisorId = String(me?.supervisorId || '');
    return supervisorOptions.filter((option) => String(option.id) !== currentSupervisorId);
  }, [supervisorOptions, me?.supervisorId]);

  const selectedSupervisorName =
    localSups.find((supervisorItem) => String(supervisorItem._id) === String(selectedSupervisorId))?.name ||
    'the selected supervisor';

  const fetchHeadline = async () => {
    try {
      const response = await fetch('/api/headline');
      const json = await response.json();

      setHeadline(json.headline?.text || '');
    } catch (error) {
      console.error('Failed to fetch headline:', error);
    }
  };

  const fetchData = async () => {
    try {
      const userId = (session?.user as any)?.id;
      if (!userId) return;

      const response = await fetch(`/api/dashboard/student?id=${userId}`, { cache: 'no-store' });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load student dashboard.');
      }

      setData(json);
      if (json?.student) {
        const domainSource =
          Array.isArray(json.project?.domains) && json.project.domains.length > 0
            ? json.project.domains
            : json.student.domains;
        const previousDomainText = json.project?.domain || json.student.domain || '';
        const restoredDomains = normalizeProjectDomainIds(domainSource, previousDomainText);
        const serverProjectDraft: StudentProjectDraft = {
          title: json.student.projectTitle || '',
          desc: json.student.projectDesc || '',
          selectedDomains: restoredDomains,
          legacyDomain: restoredDomains.length === 0 ? previousDomainText : '',
          tools: json.student.tools || '',
        };
        const savedProjectDraft = readBrowserDraft<StudentProjectDraft>(
          getStudentProjectDraftKey(String(userId))
        );
        const nextProjectDraft = savedProjectDraft || serverProjectDraft;

        setProjectDraftBaseline(serverProjectDraft);
        setTitle(nextProjectDraft.title);
        setDesc(nextProjectDraft.desc);
        setSelectedDomains(nextProjectDraft.selectedDomains);
        setLegacyDomain(nextProjectDraft.legacyDomain);
        setTools(nextProjectDraft.tools);

        try {
          const savedFile = await readBrowserFileDraft(
            `${getStudentProjectDraftKey(String(userId))}:pdf`
          );
          setFile(savedFile);
        } catch (error) {
          console.warn('Unable to restore the selected project PDF:', error);
          setFile(null);
        }

        setIsProjectDraftReady(true);
        setAcademicForm({
          program: json.student.program || 'BSCS',
          batch: json.student.batch || '',
        });
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
  };

  const fetchSupervisors = async () => {
    try {
      const response = await fetch('/api/supervisors');
      const json = await response.json();

      setLocalSups(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error('Supervisor fetch error:', error);
    }
  };

  const fetchTemplatesByStage = async () => {
    if (cachedTemplateStage === currentStage && cachedTemplates.length > 0) return;

    const requestedStage = currentStage;
    setIsFetchingTemplates(true);

    try {
      const response = await fetch(`/api/templates?stage=${requestedStage}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load templates.');
      }

      const templates = Array.isArray(json.templates)
        ? json.templates.filter(
            (template: unknown): template is WordTemplate => {
              if (!template || typeof template !== 'object') return false;

              const candidate = template as Partial<WordTemplate>;
              return (
                typeof candidate.id === 'string' &&
                typeof candidate.title === 'string' &&
                typeof candidate.filename === 'string' &&
                candidate.format === 'word' &&
                typeof candidate.content === 'string'
              );
            }
          )
        : [];

      setCachedTemplates(templates);
      setCachedTemplateStage(requestedStage);
    } catch (error) {
      console.error('Template fetch error:', error);
      showDialog({
        title: 'Templates unavailable',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to load templates from the server.',
      });
    } finally {
      setIsFetchingTemplates(false);
    }
  };

  useEffect(() => {
    fetchHeadline();
    fetchData();
    fetchSupervisors();
  }, [session]);

  // No polling: only re-check a restricted account when the browser tab becomes visible again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isFineRestricted) return;

    const refreshFineStatus = () => {
      if (document.visibilityState === 'visible') {
        void fetchData();
      }
    };

    document.addEventListener('visibilitychange', refreshFineStatus);
    return () => document.removeEventListener('visibilitychange', refreshFineStatus);
  }, [isFineRestricted]);

  useEffect(() => {
    if (!projectDraftKey || !isProjectDraftReady) return;

    const currentDraft: StudentProjectDraft = {
      title,
      desc,
      selectedDomains,
      legacyDomain,
      tools,
    };

    const saveTimer = window.setTimeout(() => {
      if (!hasStudentProjectDraftChanges(currentDraft, projectDraftBaseline)) {
        clearBrowserDraft(projectDraftKey);
        return;
      }

      writeBrowserDraft(projectDraftKey, currentDraft);
    }, 300);

    return () => window.clearTimeout(saveTimer);
  }, [
    title,
    desc,
    selectedDomains,
    legacyDomain,
    tools,
    projectDraftKey,
    projectDraftBaseline,
    isProjectDraftReady,
  ]);

  const uploadPdf = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      throw new Error('Only PDF documents are allowed.');
    }

    if (selectedFile.size > 4 * 1024 * 1024) {
      throw new Error('File exceeds the 4MB limit.');
    }

    const tokenResponse = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: selectedFile.name,
        contentType: selectedFile.type,
        fileSize: selectedFile.size,
      }),
    });

    const tokenJson = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokenJson.error || 'Failed to prepare secure upload.');
    }

    const uploadResponse = await fetch(tokenJson.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': selectedFile.type },
      body: selectedFile,
    });

    if (!uploadResponse.ok) {
      throw new Error('PDF upload failed. Please try again.');
    }

    return {
      url: tokenJson.url,
      fileSize: selectedFile.size,
    };
  };
  const handleProjectFileChange = async (nextFile: File | null) => {
    setFile(nextFile);
    if (!projectFileDraftKey) return;

    try {
      if (nextFile) {
        await writeBrowserFileDraft(projectFileDraftKey, nextFile);
      } else {
        await clearBrowserFileDraft(projectFileDraftKey);
      }
    } catch (error) {
      console.warn('Unable to save the selected project PDF in this browser:', error);
    }
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

    setIsSubmitting(true);

    try {
      const upload = file ? await uploadPdf(file) : { url: pdfUrl, fileSize: 0 };

      const response = await fetch('/api/dashboard/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: (session?.user as any)?.id,
          title: title.trim(),
          desc: desc.trim(),
          domains: selectedDomains,
          tools: tools.trim(),
          pdfUrl: upload.url,
          fileSize: upload.fileSize,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to submit project.');
      }

      if (projectDraftKey) clearBrowserDraft(projectDraftKey);
      if (projectFileDraftKey) await clearBrowserFileDraft(projectFileDraftKey);
      setFile(null);
      await fetchData();

      showDialog({
        title: 'Project submitted',
        message: json.message || 'Your project has been submitted for supervisor review.',
      });
    } catch (error: any) {
      showDialog({
        title: 'Submission failed',
        message: error.message || 'Unable to submit project right now.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSupervisorRequest = async (action: 'assignSupervisor' | 'changeSupervisor') => {
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/dashboard/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          id: (session?.user as any)?.id,
          supervisorId: selectedSupervisorId,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to update supervisor.');
      }

      setSelectedSupervisorId('');
      setIsSupervisorWarningOpen(false);

      if (action === 'changeSupervisor') {
        if (projectDraftKey) clearBrowserDraft(projectDraftKey);
        if (projectFileDraftKey) await clearBrowserFileDraft(projectFileDraftKey);
        setTitle('');
        setDesc('');
        setSelectedDomains([]);
        setLegacyDomain('');
        setTools('');
        setFile(null);
        setCachedTemplates([]);
        setCachedTemplateStage(null);
      }

      await fetchData();
      await fetchSupervisors();

      showDialog({
        title: action === 'changeSupervisor' ? 'Supervisor changed' : 'Supervisor assigned',
        message:
          json.message ||
          (action === 'changeSupervisor'
            ? 'You have started fresh under the new supervisor.'
            : 'Your supervisor has been assigned.'),
      });
    } catch (error: any) {
      showDialog({
        title: action === 'changeSupervisor' ? 'Supervisor change failed' : 'Assignment failed',
        message: error.message || 'Unable to update supervisor right now.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAssignSupervisor = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSupervisorId) {
      showDialog({
        title: 'Select supervisor',
        message: 'Choose an available supervisor before confirming.',
      });
      return;
    }

    await submitSupervisorRequest('assignSupervisor');
  };

  const openSupervisorChangeDialog = () => {
    if (isSupervisorChangeLocked) {
      showDialog({
        title: 'Supervisor change locked',
        message:
          'This project has already moved past proposal approval. Ask your supervisor to use migration if a supervisor transfer is required.',
      });
      return;
    }

    setSelectedSupervisorId('');
    setIsSupervisorWarningOpen(true);
  };

  const closeSupervisorChangeDialog = () => {
    if (isSubmitting) return;

    setSelectedSupervisorId('');
    setIsSupervisorWarningOpen(false);
  };

  const handleConfirmSupervisorChange = async () => {
    if (!selectedSupervisorId) {
      showDialog({
        title: 'Select supervisor',
        message: 'Choose a new available supervisor before confirming the change.',
      });
      return;
    }

    await submitSupervisorRequest('changeSupervisor');
  };

  const handleJoinTeam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const inviteCode = inviteCodeInput.trim().toUpperCase();

    if (!inviteCode) {
      showDialog({
        title: 'Invite code required',
        message: 'Enter a valid team invite code.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/project/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteCode }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to join team.');
      }

      setInviteCodeInput('');
      await fetchData();

      showDialog({
        title: 'Team joined',
        message: json.message || 'You have joined the team successfully.',
      });
    } catch (error: any) {
      showDialog({
        title: 'Join failed',
        message: error.message || 'Unable to join the team right now.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyInviteCode = async () => {
    if (!project?.inviteCode) return;

    await navigator.clipboard.writeText(project.inviteCode);

    showDialog({
      title: 'Copied',
      message: 'Team invite code copied to clipboard.',
    });
  };

  const openAcademicEditor = () => {
    setAcademicForm({
      program: me?.program || 'BSCS',
      batch: me?.batch || '',
    });
    setIsAcademicWarningStep(false);
    setIsAcademicDialogOpen(true);
  };

  const handleAcademicUpdate = async () => {
    if (!academicForm.program || !academicForm.batch) {
      showDialog({
        title: 'Missing academic details',
        message: 'Select both program and batch.',
      });
      return;
    }

    setIsAcademicUpdating(true);

    try {
      const response = await fetch('/api/dashboard/student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProgramBatch',
          id: (session?.user as any)?.id,
          program: academicForm.program,
          batch: academicForm.batch,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to update program and batch.');
      }

      setIsAcademicDialogOpen(false);
      setIsAcademicWarningStep(false);
      if (projectDraftKey) clearBrowserDraft(projectDraftKey);
      if (projectFileDraftKey) await clearBrowserFileDraft(projectFileDraftKey);
      setTitle('');
      setDesc('');
      setSelectedDomains([]);
      setLegacyDomain('');
      setTools('');
      setFile(null);
      setCachedTemplates([]);
      setCachedTemplateStage(null);

      await fetchData();
      await fetchSupervisors();

      showDialog({
        title: 'Academic info updated',
        message: json.message || 'Program and batch updated successfully.',
      });
    } catch (error: any) {
      showDialog({
        title: 'Update blocked',
        message: error.message || 'Could not update program and batch.',
      });
    } finally {
      setIsAcademicUpdating(false);
    }
  };

  const handleOpenTemplate = async (template?: WordTemplate) => {
    if (!template) {
      await fetchTemplatesByStage();
      setActiveTab('resources');
      return;
    }

    setIsCopied(false);
    setSelectedTemplate(template);
  };

  const closeTemplateDialog = () => {
    if (isCopyingTemplate) return;

    setSelectedTemplate(null);
    setIsCopied(false);
  };

  const getPlainTextFromHtml = (html: string) => {
    const documentFragment = new DOMParser().parseFromString(html, 'text/html');
    return documentFragment.body.innerText.replace(/\n{3,}/g, '\n\n').trim();
  };

  const copyHtmlWithLegacySelection = (html: string) => {
    const container = document.createElement('div');
    container.contentEditable = 'true';
    container.setAttribute('aria-hidden', 'true');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.opacity = '0';
    container.innerHTML = html;
    document.body.appendChild(container);

    const selection = window.getSelection();
    const previousRanges: Range[] = [];

    if (selection) {
      for (let index = 0; index < selection.rangeCount; index += 1) {
        previousRanges.push(selection.getRangeAt(index).cloneRange());
      }

      const range = document.createRange();
      range.selectNodeContents(container);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    const copied = document.execCommand('copy');

    if (selection) {
      selection.removeAllRanges();
      previousRanges.forEach((range) => selection.addRange(range));
    }

    container.remove();
    return copied;
  };

  const handleCopyTemplate = async () => {
    if (!selectedTemplate || isCopyingTemplate) return;

    const html = selectedTemplate.content.trim();
    if (!html) {
      showDialog({
        title: 'Template is empty',
        message: 'This template has no content to copy.',
      });
      return;
    }

    setIsCopyingTemplate(true);

    try {
      const plainText = getPlainTextFromHtml(html);
      const clipboardHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;

      if (
        navigator.clipboard?.write &&
        typeof ClipboardItem !== 'undefined'
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([clipboardHtml], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          }),
        ]);
      } else if (!copyHtmlWithLegacySelection(html)) {
        throw new Error('Rich clipboard copying is not supported in this browser.');
      }

      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 1800);
    } catch (error) {
      console.error('Word template copy failed:', error);
      showDialog({
        title: 'Copy failed',
        message:
          error instanceof Error
            ? error.message
            : 'Your browser blocked clipboard access. Try again from a secure tab.',
      });
    } finally {
      setIsCopyingTemplate(false);
    }
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
            onDomainsChange={(domains) => {
              setSelectedDomains(domains);
              if (domains.length > 0) setLegacyDomain('');
            }}
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
            onFetchTemplates={fetchTemplatesByStage}
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
        onClose={() => {
          setIsAcademicDialogOpen(false);
          setIsAcademicWarningStep(false);
        }}
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
