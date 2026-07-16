'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  Lock,
  LogIn,
  Megaphone,
  RefreshCcw,
  Settings,
  Upload,
  Volume2,
  UserCheck,
  Users,
  Wrench,
  Mic,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';

import {
  AvatarBadge,
  Badge,
  Button,
  DashboardGrid,
  DashboardPanel,
  DashboardShell,
  Dialog,
  LinkifiedText,
  SectionHeader,
  StatCard,
  StyledInput,
  TextArea,
} from '../ui/SharedUI';

import { VoiceChat } from '../ui/VoiceChat';
import { LateRegistrationFineBanner } from '../ui/LateRegistrationFineBanner';
import { PROGRAM_MAP } from '../../config/appSettings';
import {
  PROJECT_DOMAIN_GROUPS,
  formatProjectDomainLabels,
  getProjectDomainLabel,
  getProjectDomainLabels,
  normalizeProjectDomainIds,
} from '../../config/projectDomains';

type StudentTab = 'overview' | 'project' | 'team' | 'resources';

type WordTemplate = {
  id: string;
  title: string;
  filename: string;
  format: 'word';
  content: string;
};

const STAGES = [
  { id: 'PROPOSAL', label: 'Proposal' },
  { id: 'THESIS_DRAFT', label: 'Thesis Draft' },
  { id: 'FINAL_DELIVERABLES', label: 'Final Deliverables' },
];

const DASHBOARD_THEME = {
  name: 'Professional',
  bg: 'bg-[#14213d]',
  text: 'text-[#fca311]',
  lightBg: 'bg-[#fca311]/10',
  ring: 'focus:ring-[#fca311]',
};

const getProgramName = (program?: string) => {
  if (!program) return 'No program';
  return (PROGRAM_MAP as Record<string, string>)[program] || program;
};

const getStageLabel = (stage?: string) => {
  return STAGES.find((item) => item.id === stage)?.label || 'Proposal';
};

const getStageProgress = (stage?: string) => {
  const index = Math.max(
    STAGES.findIndex((item) => item.id === stage),
    0
  );

  return Math.round(((index + 1) / STAGES.length) * 100);
};

const getSafePdfKey = (url?: string) => {
  if (!url) return '';
  return url.includes('.com/') ? url.split('.com/')[1] : url.replace(/^\//, '');
};

const getSecureMediaUrl = (url?: string) => {
  const key = getSafePdfKey(url);
  return key ? `/api/read-pdf?url=${encodeURIComponent(key)}` : '';
};

const formatAnnouncementTime = (value?: string | Date | null) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const splitTools = (tools?: string) => {
  return String(tools || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

type ProjectDomainSelectorProps = {
  selectedDomains: string[];
  legacyDomain?: string;
  disabled?: boolean;
  onChange: (domains: string[]) => void;
};

const ProjectDomainSelector = ({
  selectedDomains,
  legacyDomain = '',
  disabled = false,
  onChange,
}: ProjectDomainSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const toggleDomain = (domainId: string) => {
    if (disabled) return;

    onChange(
      selectedDomains.includes(domainId)
        ? selectedDomains.filter((item) => item !== domainId)
        : [...selectedDomains, domainId]
    );
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="block text-sm font-semibold text-[var(--color-text)]">
          Project Domains
        </label>
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">
          {selectedDomains.length} selected
        </span>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={isOpen}
          aria-controls="project-domain-options"
          onClick={() => setIsOpen((previous) => !previous)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-65"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Globe size={18} className="text-[var(--color-accent)]" />
            {selectedDomains.length > 0
              ? `${selectedDomains.length} domain${selectedDomains.length === 1 ? '' : 's'} selected`
              : 'Choose project domains'}
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {(selectedDomains.length > 0 || legacyDomain) && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] px-4 py-3">
            {selectedDomains.map((domainId) => (
              <span
                key={domainId}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-text)]"
              >
                {getProjectDomainLabel(domainId)}
                {!disabled && (
                  <button
                    type="button"
                    aria-label={`Remove ${getProjectDomainLabel(domainId)}`}
                    onClick={() => toggleDomain(domainId)}
                    className="rounded-full p-0.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                  >
                    <X size={13} />
                  </button>
                )}
              </span>
            ))}

            {selectedDomains.length === 0 && legacyDomain && (
              <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-muted)]">
                Previous value: {legacyDomain}
              </span>
            )}
          </div>
        )}

        {isOpen && !disabled && (
          <div
            id="project-domain-options"
            className="portal-scrollbar max-h-[28rem] space-y-5 overflow-y-auto border-t border-[var(--color-border)] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold leading-5 text-[var(--color-text-muted)]">
                Select every area that applies to this project.
              </p>
              {selectedDomains.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="shrink-0 text-xs font-bold text-[var(--color-text-strong)] underline-offset-4 hover:text-[var(--color-accent)] hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            {legacyDomain && selectedDomains.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
                Your previous text value is preserved above. Select one or more catalogue domains before the next submission.
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {PROJECT_DOMAIN_GROUPS.map((group) => (
                <fieldset key={group.category} className="space-y-2">
                  <legend className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[var(--color-text-muted)]">
                    {group.category}
                  </legend>

                  {group.options.map((option) => {
                    const isChecked = selectedDomains.includes(option.id);

                    return (
                      <label
                        key={option.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                          isChecked
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                            : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleDomain(option.id)}
                          className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                        />
                        <span className="text-sm font-semibold leading-5 text-[var(--color-text)]">
                          {option.label}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
        You can select multiple domains, such as Machine Learning and Augmented Reality.
      </p>
    </div>
  );
};

const ProjectTimeline = ({ currentStage }: { currentStage?: string }) => {
  const currentIndex = Math.max(
    STAGES.findIndex((stage) => stage.id === currentStage),
    0
  );

  return (
    <DashboardPanel>
      <SectionHeader
        title="Project Progress"
        description={`${getStageProgress(currentStage)}% complete based on the current stage.`}
      />

      <div className="portal-scrollbar overflow-x-auto">
        <div className="relative flex min-w-[560px] items-start justify-between gap-4 pb-2">
          <div className="absolute left-10 right-10 top-5 h-px bg-[var(--color-border)]" />

          {STAGES.map((stage, index) => {
            const isDone = index < currentIndex;
            const isActive = index === currentIndex;

            return (
              <div
                key={stage.id}
                className="relative z-10 flex flex-1 flex-col items-center text-center"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold ${
                    isDone
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-white'
                      : isActive
                        ? 'border-[var(--color-accent)] bg-[var(--color-surface)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)]'
                  }`}
                >
                  {isDone ? <CheckCircle size={18} /> : index + 1}
                </div>

                <p
                  className={`mt-3 text-sm font-semibold ${
                    isActive || isDone
                      ? 'text-[var(--color-text)]'
                      : 'text-[var(--color-text-muted)]'
                  }`}
                >
                  {stage.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardPanel>
  );
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

  const me = data?.student;
  const supervisor = data?.supervisor;
  const project = data?.project;
  const supervisorBroadcast = data?.supervisorBroadcast || null;

  const projectMembers = Array.isArray(project?.members) ? project.members : [];
  const isLegacyThreeMemberTeam = projectMembers.length > 2;
  const canShareInviteCode = Boolean(project?.inviteCode) && projectMembers.length < 2;
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
  const canSubmit = ['Pending', 'Rejected', 'Changes Requested'].includes(me?.status);
  const isSupervisorChangeLocked =
    !isUnassigned && (project?.status === 'Approved' || currentStage !== 'PROPOSAL');

  const announcementItems = useMemo(() => {
    const items: any[] = [];

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

      const response = await fetch(`/api/dashboard/student?id=${userId}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || 'Failed to load student dashboard.');
      }

      setData(json);

      if (json?.student) {
        setTitle(json.student.projectTitle || '');
        setDesc(json.student.projectDesc || '');
        const domainSource =
          Array.isArray(json.project?.domains) && json.project.domains.length > 0
            ? json.project.domains
            : json.student.domains;
        const previousDomainText = json.project?.domain || json.student.domain || '';
        const restoredDomains = normalizeProjectDomainIds(domainSource, previousDomainText);

        setSelectedDomains(restoredDomains);
        setLegacyDomain(restoredDomains.length === 0 ? previousDomainText : '');
        setTools(json.student.tools || '');
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

  const handleSubmitProject = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
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
        body: JSON.stringify({
          studentId: (session?.user as any)?.id,
          inviteCode,
        }),
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
      setTitle('');
      setDesc('');
      setDomain('');
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

  const renderOverview = () => (
    <div className="space-y-7 sm:space-y-6">
      <LateRegistrationFineBanner
        daysLate={Number(me?.lateRegistrationDays || 0)}
        amount={Number(me?.lateRegistrationFine || 0)}
      />

      {announcementItems.length > 0 && (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                  <Mic size={19} />

                  <span className="absolute -right-1 -top-1 flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                  </span>
                </div>

                <div>
                  <p className="text-sm font-extrabold text-[var(--color-text)]">
                    Announcements
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--color-text-muted)]">
                    {announcementItems.length} active update{announcementItems.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsAnnouncementPanelOpen((prev) => !prev)}
                aria-label={isAnnouncementPanelOpen ? 'Collapse announcements' : 'Show announcements'}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text)] transition hover:bg-[var(--color-surface)]"
              >
                {isAnnouncementPanelOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>

            {isAnnouncementPanelOpen && (
              <div className="portal-scrollbar mt-4 max-h-52 space-y-3 overflow-y-auto pr-1">
                {announcementItems.map((item) => {
                  const isSupervisor = item.tone === 'supervisor';

                  const cardClass = isSupervisor
                    ? 'border-purple-500 bg-purple-600 dark:border-purple-400/40 dark:bg-purple-600/80'
                    : 'border-emerald-300 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/70';

                  const iconClass = isSupervisor
                    ? 'bg-white/20 text-white ring-1 ring-white/30'
                    : 'bg-emerald-200 text-emerald-950 ring-1 ring-emerald-300 dark:bg-emerald-800 dark:text-emerald-50 dark:ring-emerald-700';

                  const badgeClass = isSupervisor
                    ? 'bg-white/20 text-white ring-1 ring-white/30'
                    : 'bg-emerald-200 text-emerald-950 ring-1 ring-emerald-300 dark:bg-emerald-800 dark:text-emerald-50 dark:ring-emerald-700';

                  const titleClass = isSupervisor
                    ? 'text-white'
                    : 'text-emerald-950 dark:text-emerald-50';

                  const metaClass = isSupervisor
                    ? 'text-white/80'
                    : 'text-emerald-800 dark:text-emerald-200';

                  const contentClass = isSupervisor
                    ? 'text-white'
                    : 'text-emerald-950 dark:text-emerald-50';

                  return (
                    <div key={item.id} className={`rounded-xl border p-4 ${cardClass}`}>
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
                        >
                          {item.type === 'audio' ? <Mic size={18} /> : <Megaphone size={18} />}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className={`text-sm font-extrabold ${titleClass}`}>
                              {item.title}
                            </p>

                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${badgeClass}`}
                            >
                              {item.source}
                            </span>

                            {item.createdAt ? (
                              <span className={`text-xs font-semibold ${metaClass}`}>
                                {formatAnnouncementTime(item.createdAt)}
                              </span>
                            ) : null}
                          </div>

                          {item.type === 'audio' ? (
                            <audio
                              controls
                              src={getSecureMediaUrl(item.content)}
                              className="mt-3 h-10 w-full max-w-md"
                            />
                          ) : (
                            <p className={`mt-2 text-sm leading-6 ${contentClass}`}>
                              <LinkifiedText text={item.content} />
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      <DashboardGrid columns="four">
        <StatCard
          label="Project Status"
          value={me?.status || 'Pending'}
          icon={<ClipboardCheck size={18} />}
        />
        <StatCard
          label="Current Stage"
          value={getStageLabel(currentStage)}
          hint={`${getStageProgress(currentStage)}% complete`}
          icon={<GraduationCap size={18} />}
        />
        <StatCard
          label="Supervisor"
          value={supervisor?.name || 'Unassigned'}
          icon={<UserCheck size={18} />}
        />
        <StatCard
          label="Team Members"
          value={`${projectMembers.length || 1} Student${(projectMembers.length || 1) === 1 ? '' : 's'}`}
          icon={<Users size={18} />}
        />
      </DashboardGrid>

      <ProjectTimeline currentStage={currentStage} />

      <div className="grid gap-7 sm:gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <DashboardPanel>
          <SectionHeader
            title="Project Information"
            description="Your current title, domains, tools, and supervisor review status."
            action={
              <Button variant="outline" onClick={() => setActiveTab('project')}>
                Edit Project
              </Button>
            }
          />

          {me?.projectTitle ? (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Project Title
                </p>
                <h3 className="mt-2 text-xl font-bold tracking-tight text-[var(--color-text)]">
                  {me.projectTitle}
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Domains
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {savedDomainLabels.length > 0 ? (
                      savedDomainLabels.map((domainLabel) => (
                        <Badge key={domainLabel} variant="accent">
                          {domainLabel}
                        </Badge>
                      ))
                    ) : savedDomainText ? (
                      <Badge variant="muted">{savedDomainText}</Badge>
                    ) : (
                      <span className="text-sm text-[var(--color-text-muted)]">Not provided</span>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Tools
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {toolsList.length > 0 ? (
                      toolsList.map((tool) => (
                        <Badge key={tool} variant="accent">
                          {tool}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-[var(--color-text-muted)]">Not provided</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Description
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-text-muted)]">
                  {me.projectDesc || 'No description submitted.'}
                </p>
              </div>

              {me?.remarks && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Supervisor Remarks
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{me.remarks}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
              <FileText className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
              <p className="text-sm font-bold text-[var(--color-text)]">No project submitted yet</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Add project details and upload your PDF proposal.
              </p>
              <Button className="mt-5" onClick={() => setActiveTab('project')}>
                Start Submission
              </Button>
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel>
          <SectionHeader title="Supervisor" description="Your assigned project supervisor." />

          {supervisor ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <AvatarBadge name={supervisor.name} />
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-[var(--color-text)]">
                    {supervisor.name}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">Project Supervisor</p>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  Email
                </p>
                <p className="mt-2 break-all text-sm font-semibold text-[var(--color-text)]">
                  {supervisor.email || 'No email available'}
                </p>
              </div>

              {project?._id && (
                <Button variant="outline" className="w-full" onClick={() => setActiveTab('team')}>
                  Open Team Workspace
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 text-center">
              <Users className="mx-auto mb-3 text-[var(--color-text-muted)]" size={30} />
              <p className="text-sm font-bold text-[var(--color-text)]">No supervisor assigned</p>
              <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                Choose an available supervisor or join an existing team.
              </p>
              <Button className="mt-5 w-full" onClick={() => setActiveTab('team')}>
                Manage Assignment
              </Button>
            </div>
          )}
        </DashboardPanel>
      </div>
    </div>
  );

  const renderProject = () => (
    <DashboardPanel>
      <SectionHeader
        title="Project Submission"
        description="Update your project details and submit the required PDF for supervisor review."
        action={
          pdfUrl ? (
            <a
              href={`/api/read-pdf?url=${encodeURIComponent(getSafePdfKey(pdfUrl))}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]"
            >
              <ExternalLink size={16} />
              View PDF
            </a>
          ) : null
        }
      />

      {!canSubmit && (
        <div className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <div className="flex items-start gap-3">
            <Lock size={18} className="mt-0.5 text-[var(--color-text-muted)]" />
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Submissions are closed while your project status is{' '}
              <strong className="text-[var(--color-text)]">{me?.status}</strong>.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmitProject} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Project Title
          </label>
          <StyledInput
            value={title}
            disabled={!canSubmit}
            onChange={(event: any) => setTitle(event.target.value)}
            required
            placeholder="Enter project title"
          />
        </div>

        <ProjectDomainSelector
          selectedDomains={selectedDomains}
          legacyDomain={legacyDomain}
          disabled={!canSubmit}
          onChange={(domains) => {
            setSelectedDomains(domains);
            if (domains.length > 0) setLegacyDomain('');
          }}
        />

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Tools and Technologies
          </label>
          <StyledInput
            icon={Wrench}
            value={tools}
            disabled={!canSubmit}
            onChange={(event: any) => setTools(event.target.value)}
            required
            placeholder="e.g. React, Python, TensorFlow"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Description
          </label>
          <TextArea
            value={desc}
            disabled={!canSubmit}
            onChange={(event: any) => setDesc(event.target.value)}
            required
            placeholder="Describe your project scope, goals, and expected outcome..."
          />
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
          <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
            Project PDF
          </label>
          <input
            type="file"
            accept="application/pdf"
            disabled={!canSubmit}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
            PDF only. Maximum size 4MB.{' '}
            {file
              ? `Selected: ${file.name}`
              : pdfUrl
                ? 'Existing PDF will be reused if you do not select a new file.'
                : 'A PDF is required for first submission.'}
          </p>
        </div>

        <Button type="submit" disabled={isSubmitting || !canSubmit} className="w-full sm:w-auto">
          {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
          {isSubmitting ? 'Submitting...' : 'Submit For Review'}
        </Button>
      </form>
    </DashboardPanel>
  );

  const renderTeam = () => (
    <div className="grid gap-7 sm:gap-6 xl:grid-cols-2">
      <DashboardPanel>
        <SectionHeader
          title="Team Members"
          description={
            isLegacyThreeMemberTeam
              ? 'Legacy 3-member team. All existing members remain active, but no new members can join.'
              : projectMembers.length >= 2
                ? 'Your team is full. FYP teams can contain a maximum of 2 students.'
                : 'FYP teams can contain a maximum of 2 students. Share the invite code with one teammate.'
          }
          action={
            canShareInviteCode ? (
              <Button variant="outline" onClick={handleCopyInviteCode}>
                <Copy size={16} />
                Copy Code
              </Button>
            ) : null
          }
        />

        <div className="space-y-3">
          {projectMembers.length > 0 ? (
            projectMembers.map((member: any) => (
              <div
                key={member._id}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"
              >
                <AvatarBadge name={member.name} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--color-text)]">
                    {member.name}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {member.rollNo || member.email || 'Team member'}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-6 text-center">
              <Users className="mx-auto mb-3 text-[var(--color-text-muted)]" size={30} />
              <p className="text-sm font-bold text-[var(--color-text)]">No team members found</p>
            </div>
          )}
        </div>

        {canShareInviteCode ? (
          <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Team Invite Code
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-[var(--color-text)]">
              {project.inviteCode}
            </p>
          </div>
        ) : projectMembers.length >= 2 ? (
          <div className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Team Capacity
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-text)]">
              {isLegacyThreeMemberTeam
                ? `Legacy team preserved with all ${projectMembers.length} existing students. New members cannot join.`
                : 'Team full with 2 students. New members cannot join.'}
            </p>
          </div>
        ) : null}
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader
          title={isUnassigned ? 'Supervisor & Team Actions' : 'Team Actions'}
          description={
            isUnassigned
              ? 'Choose a supervisor or join an existing team.'
              : 'Manage your team or change your supervisor before proposal approval.'
          }
        />

        {isUnassigned && (
          <form onSubmit={handleAssignSupervisor} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Available Supervisors
              </label>
              <select
                value={selectedSupervisorId}
                onChange={(event) => setSelectedSupervisorId(event.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Select supervisor</option>
                {supervisorOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || supervisorOptions.length === 0}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <UserCheck size={16} />}
              Confirm Assignment
            </Button>
          </form>
        )}

        <div className={isUnassigned ? 'mt-6 border-t border-[var(--color-border)] pt-6' : ''}>
          <form onSubmit={handleJoinTeam} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Join Existing Team
              </label>
              <StyledInput
                value={inviteCodeInput}
                onChange={(event: any) => setInviteCodeInput(event.target.value.toUpperCase())}
                placeholder="Enter invite code"
              />
            </div>

            <Button type="submit" variant="outline" disabled={isSubmitting} className="w-full">
              <ArrowRight size={16} />
              Join Team
            </Button>
          </form>
        </div>

        {!isUnassigned && (
          <div className="mt-6 border-t border-[var(--color-border)] pt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={openSupervisorChangeDialog}
              disabled={isSubmitting || isSupervisorChangeLocked || supervisorChangeOptions.length === 0}
            >
              {isSupervisorChangeLocked ? <Lock size={16} /> : <UserCheck size={16} />}
              Change Supervisor
            </Button>

            {isSupervisorChangeLocked && (
              <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                Supervisor changes are locked after proposal approval or once the project moves beyond the proposal stage.
              </p>
            )}

            {!isSupervisorChangeLocked && supervisorChangeOptions.length === 0 && (
              <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                No other supervisor currently has an available slot.
              </p>
            )}
          </div>
        )}
      </DashboardPanel>

      {project?._id && (
        <div className="xl:col-span-2">
          <DashboardPanel>
            <SectionHeader title="Voice Workspace" description="Quick voice notes linked to this project." />
            <VoiceChat
              projectId={project._id}
              currentUserId={(session?.user as any)?.id}
              theme={DASHBOARD_THEME}
              isDarkMode={Boolean(isDarkMode)}
            />
          </DashboardPanel>
        </div>
      )}
    </div>
  );

  const renderResources = () => (
    <div className="grid gap-7 sm:gap-6 xl:grid-cols-[1fr_0.8fr]">
      <DashboardPanel>
        <SectionHeader
          title="Templates & Resources"
          description={`Templates for ${getStageLabel(currentStage)} stage.`}
          action={
            <Button variant="outline" onClick={fetchTemplatesByStage}>
              {isFetchingTemplates ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <RefreshCcw size={16} />
              )}
              Load Word Templates
            </Button>
          }
        />

        <div className="space-y-3">
          {visibleTemplates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
              <FileText className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
              <p className="text-sm font-bold text-[var(--color-text)]">No templates loaded</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Load editable Word-format templates for the current project stage.
              </p>
            </div>
          ) : (
            visibleTemplates.map((template) => (
              <button
                key={template.id || template.filename}
                type="button"
                onClick={() => handleOpenTemplate(template)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--color-text)]">
                    {template.title}
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">
                    {template.filename}
                  </p>
                </div>
                <ExternalLink size={16} className="shrink-0 text-[var(--color-text-muted)]" />
              </button>
            ))
          )}
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <SectionHeader title="Academic Settings" description="Program and batch are reset-sensitive fields." />

        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Program
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
              {currentProgramName}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              Batch
            </p>
            <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">
              {me?.batch || 'No batch'}
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={openAcademicEditor}>
            <Settings size={16} />
            Update Program / Batch
          </Button>
        </div>
      </DashboardPanel>
    </div>
  );

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
    {
      id: 'team',
      label: 'Team & Supervisor',
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
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'project' && renderProject()}
        {activeTab === 'team' && renderTeam()}
        {activeTab === 'resources' && renderResources()}
      </DashboardShell>

      <Dialog
        open={isSupervisorWarningOpen}
        onClose={closeSupervisorChangeDialog}
        title="Change Supervisor"
        description="Select a new available supervisor and review what will happen before confirming."
        footer={
          <>
            <Button
              variant="outline"
              onClick={closeSupervisorChangeDialog}
              disabled={isSubmitting}
            >
              Cancel
            </Button>

            <Button
              variant="danger"
              onClick={handleConfirmSupervisorChange}
              disabled={isSubmitting || !selectedSupervisorId}
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <AlertCircle size={16} />}
              Confirm Change
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
              New Supervisor
            </label>
            <select
              value={selectedSupervisorId}
              onChange={(event) => setSelectedSupervisorId(event.target.value)}
              disabled={isSubmitting}
              className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Select a new supervisor</option>
              {supervisorChangeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>

            {selectedSupervisorId && (
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                You selected <strong className="text-[var(--color-text)]">{selectedSupervisorName}</strong>.
              </p>
            )}
          </div>

          <div
            className={`overflow-hidden rounded-lg border ${
              isDarkMode
                ? 'border-red-500/30 bg-red-500/10'
                : 'border-red-200 bg-red-50'
            }`}
          >
            <div className="flex items-start gap-3 p-4">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isDarkMode ? 'bg-red-500/15' : 'bg-red-100'
                }`}
              >
                <AlertCircle
                  size={19}
                  className={isDarkMode ? 'text-red-300' : 'text-red-600'}
                />
              </div>

              <div>
                <p
                  className={`text-sm font-semibold ${
                    isDarkMode ? 'text-white' : 'text-black'
                  }`}
                >
                  Your current workspace will be reset
                </p>

                <p
                  className={`mt-1 text-sm leading-5 ${
                    isDarkMode ? 'text-white/70' : 'text-slate-600'
                  }`}
                >
                  This action affects your project data and team membership.
                </p>
              </div>
            </div>

            <div
              className={`border-t px-4 ${
                isDarkMode ? 'border-white/10' : 'border-red-200'
              }`}
            >
              {[
                'Your uploaded project details, files, and voice notes will be deleted.',
                'If you are in a team, you will leave it. Your teammate will keep the existing project.',
                'You will start with a new workspace under the selected supervisor.',
                'This change cannot be undone from your dashboard.',
              ].map((message) => (
                <div
                  key={message}
                  className={`flex gap-3 border-b py-3 last:border-b-0 ${
                    isDarkMode ? 'border-white/10' : 'border-red-200'
                  }`}
                >
                  <span
                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                      isDarkMode ? 'bg-red-300' : 'bg-red-500'
                    }`}
                  />

                  <p
                    className={`text-sm leading-6 ${
                      isDarkMode ? 'text-white' : 'text-black'
                    }`}
                  >
                    {message}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={isAcademicDialogOpen}
        onClose={() => {
          setIsAcademicDialogOpen(false);
          setIsAcademicWarningStep(false);
        }}
        title={isAcademicWarningStep ? 'Confirm academic reset' : 'Update academic information'}
        description={
          isAcademicWarningStep
            ? 'Changing program or batch resets your project workspace and removes current team/supervisor assignment.'
            : 'Select your correct program and batch. You will review the warning before saving.'
        }
        footer={
          isAcademicWarningStep ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsAcademicWarningStep(false)}
                disabled={isAcademicUpdating}
              >
                Back
              </Button>

              <Button variant="danger" onClick={handleAcademicUpdate} disabled={isAcademicUpdating}>
                {isAcademicUpdating ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                Confirm Reset
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setIsAcademicDialogOpen(false)}>
                Cancel
              </Button>

              <Button onClick={() => setIsAcademicWarningStep(true)}>Continue</Button>
            </>
          )
        }
      >
        {isAcademicWarningStep ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20">
            <p className="text-sm font-bold text-red-700 dark:text-red-300">
              This action will reset the student workspace.
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">
              Project title, description, domains, tools, PDF, supervisor assignment, and team
              membership can be cleared by this update.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Program
              </label>
              <select
                value={academicForm.program}
                onChange={(event) =>
                  setAcademicForm((previous) => ({
                    ...previous,
                    program: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              >
                {Object.keys(PROGRAM_MAP).map((program) => (
                  <option key={program} value={program}>
                    {getProgramName(program)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-[var(--color-text)]">
                Batch
              </label>
              <select
                value={academicForm.batch}
                onChange={(event) =>
                  setAcademicForm((previous) => ({
                    ...previous,
                    batch: event.target.value,
                  }))
                }
                className="h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Select batch</option>
                {batchOptions.map((batch) => (
                  <option key={batch} value={batch}>
                    {batch}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!selectedTemplate}
        onClose={closeTemplateDialog}
        title={selectedTemplate?.title || 'Template'}
        description="Word preview · editable after pasting"
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={closeTemplateDialog} disabled={isCopyingTemplate}>
              Close
            </Button>

            <Button onClick={handleCopyTemplate} disabled={isCopyingTemplate}>
              {isCopyingTemplate ? (
                <Loader2 className="animate-spin" size={16} />
              ) : isCopied ? (
                <CheckCircle size={16} />
              ) : (
                <Copy size={16} />
              )}
              {isCopyingTemplate ? 'Copying' : isCopied ? 'Copied for Word' : 'Copy for Word'}
            </Button>
          </>
        }
      >
        <div className="portal-scrollbar max-h-[68vh] overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 sm:p-5">
          <div
            role="document"
            aria-label={`${selectedTemplate?.title || 'Template'} Word preview`}
            className="mx-auto min-h-[720px] w-full max-w-[816px] bg-white px-6 py-10 text-black shadow-sm sm:px-10 md:px-16"
            // Trusted, allowlisted static HTML from word_templates/. Never use this for user HTML.
            dangerouslySetInnerHTML={{ __html: selectedTemplate?.content || '' }}
          />
        </div>
      </Dialog>
    </>
  );
};

export default StudentDashboard;