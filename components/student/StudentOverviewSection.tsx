import { ArrowRight, Bell, RotateCcw } from 'lucide-react';
import { Badge, Button } from '../ui';
import { getProjectStageLabel } from '../ui/Timeline';
import { LateRegistrationFineBanner } from '../ui/LateRegistrationFineBanner';
import { getStudentDocumentStatusLabel, getStudentProjectStatusPill } from './selectors/studentDashboardViewModel';
import type { AnnouncementItem, StudentSummary, SupervisorSummary } from './studentDashboardTypes';

export default function StudentOverviewSection({
  me,
  supervisor,
  announcementItems,
  currentStage,
  projectStatus,
  onOpenProject,
  onOpenTeam,
  onOpenUpdates,
  onResetProject,
  isSubmitting,
}: {
  me?: StudentSummary;
  supervisor?: SupervisorSummary;
  announcementItems: AnnouncementItem[];
  currentStage: string;
  projectStatus?: string;
  onOpenProject: () => void;
  onOpenTeam: () => void;
  onOpenUpdates: () => void;
  onResetProject: () => void;
  isSubmitting: boolean;
}) {
  const projectStatusPill = getStudentProjectStatusPill(projectStatus, currentStage);
  const documentStatus = getStudentDocumentStatusLabel(me?.status, currentStage);
  const nextStep = !supervisor
    ? { title: 'Choose a supervisor', body: 'Assign a supervisor or join a team before submitting your project.', action: 'Manage team', onClick: onOpenTeam }
    : !me?.projectTitle
      ? { title: 'Start your project', body: 'Add your project details and first document when you are ready.', action: 'Open project', onClick: onOpenProject }
      : projectStatus === 'Submitted For Review'
        ? { title: 'Your submission is in review', body: 'Your supervisor has your document. You can check its status in My Project.', action: 'View submission', onClick: onOpenProject }
        : projectStatus === 'Changes Requested'
          ? { title: 'Review the requested changes', body: 'Read the feedback, update your document, and submit it again.', action: 'Update project', onClick: onOpenProject }
          : { title: 'Continue your project', body: `You are at the ${getProjectStageLabel(currentStage)} stage. Your workspace has the latest details.`, action: 'Open project', onClick: onOpenProject };
  const latest = announcementItems[0];

  return (
    <div className="space-y-5">
      <LateRegistrationFineBanner daysLate={Number(me?.lateRegistrationDays || 0)} amount={Number(me?.lateRegistrationFine || 0)} />
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
        <p className="text-xs font-semibold text-[var(--color-text-muted)]">Your next step</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{nextStep.title}</h2>
        <p className="mt-2 max-w-[56ch] text-sm leading-6 text-[var(--color-text-muted)]">{nextStep.body}</p>
        <Button className="mt-5" onClick={nextStep.onClick}>{nextStep.action}<ArrowRight size={16} /></Button>
      </section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h3 className="text-sm font-semibold">Project status</h3>
          <p className="mt-3 text-lg font-semibold">{getProjectStageLabel(currentStage)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="muted">{documentStatus}</Badge>
            {projectStatusPill && <Badge variant={projectStatusPill.includes('Approved') ? 'success' : projectStatusPill === 'Rejected' ? 'danger' : 'warning'}>{projectStatusPill}</Badge>}
          </div>
          <p className="mt-4 truncate text-sm text-[var(--color-text-muted)]">{me?.projectTitle || 'Project details have not been added yet.'}</p>
        </section>
        <section className="portal-latest-update rounded-2xl border border-[var(--color-border)] p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Bell size={17} />Latest update</h3>
          {latest ? <>
            <p className="mt-3 text-sm font-semibold">{latest.title}</p>
            <p className="mt-1 line-clamp-2 text-sm font-bold leading-6 text-[var(--color-text)]">{latest.type === 'audio' ? 'Voice announcement available.' : latest.content}</p>
            <Button variant="ghost" className="mt-3 px-0" onClick={onOpenUpdates}>View updates <ArrowRight size={15} /></Button>
          </> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">No new announcements.</p>}
        </section>
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onResetProject} disabled={isSubmitting} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--color-warning)] px-4 py-2 text-sm font-semibold text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] disabled:opacity-55"><RotateCcw size={16} />Reset Project</button>
      </div>
    </div>
  );
}
