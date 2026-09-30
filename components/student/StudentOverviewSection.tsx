import {
  ArrowRight,
  Bell,
  CheckCircle,
  FileText,
  Megaphone,
  Mic,
  UserCheck,
  Users,
} from 'lucide-react';
import { Badge, Button, LinkifiedText } from '../ui';
import { getProjectStageLabel, getProjectStageProgress } from '../ui/Timeline';
import { LateRegistrationFineBanner } from '../ui/LateRegistrationFineBanner';
import type { ProjectRatings } from '../../config/projectRatings';
import { ProjectRatingsDisplay } from '../project-ratings/ProjectRatingsDisplay';
import {
  getStudentDocumentStatusLabel,
  getStudentProjectStatusPill,
} from './selectors/studentDashboardViewModel';
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
  return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

const getRatingAverage = (ratings?: ProjectRatings) => {
  const round = ratings?.thesis ? 'Thesis' : ratings?.proposal ? 'Proposal' : null;
  const snapshot = ratings?.thesis || ratings?.proposal;
  if (!round || !snapshot) return null;
  return {
    round,
    average: ((snapshot.projectIdea + snapshot.technicalMerit + snapshot.documentationQuality) / 3).toFixed(1),
  };
};

export default function StudentOverviewSection({
  me,
  supervisor,
  projectId,
  announcementItems,
  isAnnouncementPanelOpen,
  onToggleAnnouncements,
  currentStage,
  projectStatus,
  projectRatings,
  projectMembers,
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
  projectStatus?: string;
  projectRatings?: ProjectRatings;
  projectMembers: ProjectMember[];
  getSecureMediaUrl: (url?: string) => string;
  onOpenProject: () => void;
  onOpenTeam: () => void;
}) {
  const projectStatusPill = getStudentProjectStatusPill(projectStatus, currentStage);
  const documentStatus = getStudentDocumentStatusLabel(me?.status, currentStage);
  const rating = getRatingAverage(projectRatings);
  const stageProgress = getProjectStageProgress(currentStage);

  const nextStep = !supervisor
    ? { title: 'Choose a supervisor', body: 'Assign a supervisor or join an existing team before submitting your project.', action: 'Manage team', onClick: onOpenTeam }
    : !me?.projectTitle
      ? { title: 'Start your project', body: 'Add the project title, domain, tools, description, and first PDF.', action: 'Open project', onClick: onOpenProject }
      : projectStatus === 'Submitted For Review'
        ? { title: 'Waiting for supervisor review', body: 'Your latest document is submitted. No action is required until a decision arrives.', action: 'View submission', onClick: onOpenProject }
        : projectStatus === 'Changes Requested'
          ? { title: 'Changes requested', body: 'Review the supervisor remarks and submit the updated document when ready.', action: 'Update project', onClick: onOpenProject }
          : { title: 'Prepare the next document', body: `${getProjectStageLabel(currentStage)} is your current stage. Keep the workspace ready for the next submission.`, action: 'Open project', onClick: onOpenProject };

  return (
    <div className="space-y-4">
      <LateRegistrationFineBanner daysLate={Number(me?.lateRegistrationDays || 0)} amount={Number(me?.lateRegistrationFine || 0)} />

      <div className="portal-bento">
        <section className="portal-bento-tile portal-bento-accent p-5 md:col-span-7">
          <p className="portal-eyebrow">Next step</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[var(--color-text)]">{nextStep.title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-muted)]">{nextStep.body}</p>
          <Button className="mt-4" onClick={nextStep.onClick}>{nextStep.action}<ArrowRight size={15} /></Button>
        </section>

        <section className="portal-bento-tile p-5 md:col-span-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="portal-eyebrow">Project stage</p>
              <h2 className="mt-2 text-xl font-black text-[var(--color-text)]">{getProjectStageLabel(currentStage)}</h2>
            </div>
            <span className="text-sm font-black text-[var(--color-text-muted)]">{stageProgress}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-bg-soft)]"><div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${stageProgress}%` }} /></div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="muted">{documentStatus}</Badge>
            {projectStatusPill && <Badge variant={projectStatusPill === 'Project Approved' ? 'success' : projectStatusPill === 'Rejected' ? 'danger' : 'warning'}>{projectStatusPill}</Badge>}
          </div>
        </section>

        <section className="portal-bento-tile p-5 md:col-span-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="portal-eyebrow">Announcements</p>
              <h2 className="mt-1 text-lg font-black text-[var(--color-text)]">{announcementItems.length ? `${announcementItems.length} update${announcementItems.length === 1 ? '' : 's'}` : 'No new updates'}</h2>
            </div>
            {announcementItems.length > 0 && <Button variant="ghost" onClick={onToggleAnnouncements}><Bell size={15} />{isAnnouncementPanelOpen ? 'Hide' : 'Show'}</Button>}
          </div>
          {!isAnnouncementPanelOpen && announcementItems[0] && (
            <div className="mt-4 rounded-xl bg-[var(--color-surface-muted)] p-3">
              <p className="text-xs font-extrabold text-[var(--color-text)]">{announcementItems[0].title}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{announcementItems[0].type === 'audio' ? 'Voice announcement' : announcementItems[0].content}</p>
            </div>
          )}
          {isAnnouncementPanelOpen && announcementItems.length > 0 && (
            <div className="portal-scrollbar mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              {announcementItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">{item.type === 'audio' ? <Mic size={15} /> : <Megaphone size={15} />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-extrabold text-[var(--color-text)]">{item.title}</p>
                        <span className="text-[10px] font-bold text-[var(--color-text-soft)]">{item.source}</span>
                        {item.createdAt && <span className="text-[10px] text-[var(--color-text-soft)]">{formatAnnouncementTime(item.createdAt)}</span>}
                      </div>
                      {item.type === 'audio' ? <audio controls src={getSecureMediaUrl(item.content)} className="mt-2 h-9 w-full" /> : <p className="mt-1.5 text-xs leading-5 text-[var(--color-text-muted)]"><LinkifiedText text={item.content} /></p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="portal-bento-tile portal-bento-soft p-5 md:col-span-6">
          <p className="portal-eyebrow">Supervisor</p>
          {supervisor ? (
            <>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)] text-white"><UserCheck size={18} /></span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[var(--color-text)]">{supervisor.name}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{supervisor.email || 'Project supervisor'}</p>
                </div>
              </div>
              <Button className="mt-4" variant="outline" onClick={onOpenTeam}>Team & supervisor</Button>
            </>
          ) : (
            <div className="mt-3"><p className="text-sm font-extrabold text-[var(--color-text)]">No supervisor assigned</p><Button className="mt-3" onClick={onOpenTeam}>Manage assignment</Button></div>
          )}
        </section>

        <section className="portal-bento-tile p-5 md:col-span-7">
          <p className="portal-eyebrow">Project</p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="line-clamp-2 text-lg font-black text-[var(--color-text)]">{me?.projectTitle || 'Project not started'}</h2>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">{me?.projectDesc || 'Your submitted project summary will appear here.'}</p>
            </div>
            <FileText size={20} className="shrink-0 text-[var(--color-text-soft)]" />
          </div>
          <Button className="mt-4" variant="outline" onClick={onOpenProject}>Open project</Button>
        </section>

        <section className="portal-bento-tile p-5 md:col-span-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="portal-eyebrow">Team</p>
              <h2 className="mt-2 text-lg font-black text-[var(--color-text)]">{projectMembers.length || (projectId ? 1 : 0)} member{projectMembers.length === 1 ? '' : 's'}</h2>
            </div>
            <Users size={19} className="text-[var(--color-text-soft)]" />
          </div>
          <div className="mt-3 space-y-1.5">
            {projectMembers.slice(0, 3).map((member) => <p key={member._id} className="truncate text-xs text-[var(--color-text-muted)]"><strong className="text-[var(--color-text)]">{member.name}</strong> · {member.rollNo || member.email}</p>)}
          </div>
          <Button className="mt-4" variant="ghost" onClick={onOpenTeam}>Manage team <ArrowRight size={14} /></Button>
        </section>

        <section className="portal-bento-tile portal-bento-soft p-5 md:col-span-12">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="portal-eyebrow">Latest rating</p>
              {rating ? <p className="mt-1 text-lg font-black text-[var(--color-text)]">{rating.round} · {rating.average} / 10</p> : <p className="mt-1 text-sm font-extrabold text-[var(--color-text)]">No rating recorded yet</p>}
            </div>
            <CheckCircle size={20} className={rating ? 'text-[var(--color-success)]' : 'text-[var(--color-text-soft)]'} />
          </div>
          {projectRatings && (
            <details className="portal-disclosure mt-4">
              <summary>View rating breakdown</summary>
              <div>
                <ProjectRatingsDisplay ratings={projectRatings} stage={currentStage} />
              </div>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
