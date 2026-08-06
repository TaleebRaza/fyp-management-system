import {
  ClipboardCheck,
  FileText,
  GraduationCap,
  Megaphone,
  Mic,
  UserCheck,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AvatarBadge,
  Badge,
  Button,
  DashboardGrid,
  DashboardPanel,
  LinkifiedText,
  SectionHeader,
  StatCard,
} from '../ui';
import {
  Timeline,
  getProjectStageLabel,
  getProjectStageProgress,
} from '../ui/Timeline';
import { LateRegistrationFineBanner } from '../ui/LateRegistrationFineBanner';
import { ProjectRatingsDisplay } from '../project-ratings/ProjectRatingsDisplay';
import type { ProjectRatings } from '../../config/projectRatings';
import type {
  AnnouncementItem,
  ProjectMember,
  StudentSummary,
  SupervisorSummary,
} from './studentDashboardTypes';

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

export default function StudentOverviewSection({
  me,
  supervisor,
  projectId,
  announcementItems,
  isAnnouncementPanelOpen,
  onToggleAnnouncements,
  currentStage,
  projectRatings,
  projectMembers,
  savedDomainLabels,
  savedDomainText,
  toolsList,
  getSecureMediaUrl,
  onOpenProject,
  onOpenTeam,
}: {
  me?: StudentSummary;
  supervisor?: SupervisorSummary;
  projectId?: string;
  announcementItems: AnnouncementItem[];
  isAnnouncementPanelOpen: boolean;
  onToggleAnnouncements: () => void;
  currentStage: string;
  projectRatings?: ProjectRatings;
  projectMembers: ProjectMember[];
  savedDomainLabels: string[];
  savedDomainText: string;
  toolsList: string[];
  getSecureMediaUrl: (url?: string) => string;
  onOpenProject: () => void;
  onOpenTeam: () => void;
}) {
  return (
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
              onClick={onToggleAnnouncements}
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
                const titleClass = isSupervisor ? 'text-white' : 'text-emerald-950 dark:text-emerald-50';
                const metaClass = isSupervisor ? 'text-white/80' : 'text-emerald-800 dark:text-emerald-200';
                const contentClass = isSupervisor ? 'text-white' : 'text-emerald-950 dark:text-emerald-50';

                return (
                  <div key={item.id} className={`rounded-xl border p-4 ${cardClass}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
                        {item.type === 'audio' ? <Mic size={18} /> : <Megaphone size={18} />}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`text-sm font-extrabold ${titleClass}`}>
                            {item.title}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${badgeClass}`}>
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

      <DashboardGrid>
        <StatCard
          label="Project Status"
          value={me?.status || 'Pending'}
          icon={<ClipboardCheck size={18} />}
        />
        <StatCard
          label="Current Stage"
          value={getProjectStageLabel(currentStage)}
          hint={`${getProjectStageProgress(currentStage)}% complete`}
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

      <Timeline currentStage={currentStage} descriptionSuffix="based on the current stage." />

      <div className="grid gap-7 sm:gap-6 xl:grid-cols-[1.4fr_0.8fr]">
        <DashboardPanel>
          <SectionHeader
            title="Project Information"
            description="Your current title, domains, tools, and supervisor review status."
            action={
              <Button variant="outline" onClick={onOpenProject}>
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

              {me.remarks && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Supervisor Remarks
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-text)]">{me.remarks}</p>
                </div>
              )}

              <ProjectRatingsDisplay ratings={projectRatings} stage={currentStage} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
              <FileText className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
              <p className="text-sm font-bold text-[var(--color-text)]">No project submitted yet</p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                Add project details and upload your PDF proposal.
              </p>
              <Button className="mt-5" onClick={onOpenProject}>
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

              {projectId && (
                <Button variant="outline" className="w-full" onClick={onOpenTeam}>
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
              <Button className="mt-5 w-full" onClick={onOpenTeam}>
                Manage Assignment
              </Button>
            </div>
          )}
        </DashboardPanel>
      </div>
    </div>
  );
}
