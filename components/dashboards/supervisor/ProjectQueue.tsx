import { ChevronRight, FileText, Search } from 'lucide-react';
import type { ChangeEventHandler } from 'react';

import { AvatarBadge, Badge, Button, DashboardGrid, DashboardPanel, EmptyState, SectionHeader, Select, StyledInput } from '../../ui/SharedUI';
import {
  getMemberNames,
  getMemberRollNumbers,
  getProgramName,
  getProjectDomainDisplayLabels,
  getProjectProgram,
  getSafePdfKey,
  getStatusVariant,
  isProjectReviewable,
  type ProjectQueueFilter,
  type SupervisorProject,
} from './projectView';
import { ExportProjectsButton } from './ExportProjectsButton';

type ProjectQueueProps = {
  title: string;
  description: string;
  queueFilter: ProjectQueueFilter;
  projects: SupervisorProject[];
  emptyState: { title: string; description: string };
  search: string;
  batchFilter: string;
  batches: string[];
  isExporting: boolean;
  onSearchChange: ChangeEventHandler<HTMLInputElement>;
  onBatchChange: ChangeEventHandler<HTMLSelectElement>;
  onClearQueueFilter: () => void;
  onExport: () => void;
  onSelectProject: (project: SupervisorProject) => void;
};

function ProjectCard({ project, onSelect }: { project: SupervisorProject; onSelect: () => void }) {
  const memberNames = getMemberNames(project);
  const memberRollNumbers = getMemberRollNumbers(project);
  const pdfKey = getSafePdfKey(project.pdfUrl);
  const isReviewable = isProjectReviewable(project);
  const domainLabels = getProjectDomainDisplayLabels(project);

  return (
    <button type="button" onClick={onSelect} className={`group flex min-h-full flex-col rounded-xl border p-4 text-left transition-colors ${isReviewable ? 'border-pink-500/70 bg-pink-50/80 shadow-sm ring-1 ring-pink-500/20 hover:bg-pink-50 dark:bg-pink-500/10 dark:hover:bg-pink-500/15' : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-muted)]'}`}>
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><AvatarBadge name={memberNames} className="h-11 w-11" /><div className="min-w-0"><h3 className="truncate text-sm font-bold text-[var(--color-text)]">{memberNames}</h3><p className="mt-1 truncate text-xs font-semibold text-[var(--color-text-muted)]">{memberRollNumbers}</p></div></div><div className="flex shrink-0 flex-col items-end gap-2"><Badge variant={getStatusVariant(project.status)}>{project.status || 'Pending'}</Badge>{isReviewable && <span className="inline-flex items-center rounded-full border border-pink-500/40 bg-white/90 px-2.5 py-1 text-xs font-extrabold text-pink-700 shadow-sm dark:border-pink-300/30 dark:bg-pink-500/20 dark:text-pink-100">Waiting for review</span>}</div></div>
      <div className="mt-4 flex flex-wrap gap-2"><Badge variant="muted">{getProgramName(getProjectProgram(project))}</Badge>{project.batch && <Badge variant="muted">{project.batch}</Badge>}{project.semester && <Badge variant="muted">{project.semester}</Badge>}{domainLabels.map((domainLabel) => <Badge key={domainLabel} variant="accent">{domainLabel}</Badge>)}</div>
      <div className={`mt-4 flex-1 rounded-xl border p-4 ${isReviewable ? 'border-pink-500/30 bg-white/70 dark:bg-pink-950/20' : 'border-[var(--color-border)] bg-[var(--color-surface-muted)]'}`}><p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Project</p>{project.projectTitle ? <><p className="mt-2 line-clamp-2 text-sm font-bold leading-6 text-[var(--color-text)]">{project.projectTitle}</p>{project.tools && <p className="mt-2 line-clamp-1 text-xs font-semibold text-[var(--color-text-muted)]">{project.tools}</p>}</> : <p className="mt-2 text-sm font-semibold text-[var(--color-text-muted)]">Project details not submitted yet.</p>}</div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4"><span className={`text-xs font-bold ${isReviewable ? 'text-pink-700 dark:text-pink-200' : 'text-[var(--color-text-muted)]'}`}>{pdfKey ? 'PDF attached' : 'No PDF attached'}</span><span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--color-accent)]">Review<ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span></div>
    </button>
  );
}

export function ProjectQueue({
  title,
  description,
  queueFilter,
  projects,
  emptyState,
  search,
  batchFilter,
  batches,
  isExporting,
  onSearchChange,
  onBatchChange,
  onClearQueueFilter,
  onExport,
  onSelectProject,
}: ProjectQueueProps) {
  return (
    <DashboardPanel className="flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      <SectionHeader title={title} description={description} action={<div className="flex flex-wrap gap-2">{queueFilter !== 'all' && <Button variant="outline" onClick={onClearQueueFilter}>Clear queue filter</Button>}<ExportProjectsButton isExporting={isExporting} label="Export Excel" onExport={onExport} /></div>} />
      <div className="mb-5 grid shrink-0 gap-3 lg:grid-cols-[1fr_14rem]"><StyledInput icon={Search} value={search} onChange={onSearchChange} placeholder="Search by student, roll number, title, domain, status..." /><Select value={batchFilter} onChange={onBatchChange}><option value="All">All Batches</option>{batches.map((batch) => <option key={batch} value={batch}>{batch}</option>)}</Select></div>
      {projects.length === 0 ? <div className="flex min-h-0 flex-1 items-center justify-center"><EmptyState title={emptyState.title} description={emptyState.description} icon={<FileText size={28} />} /></div> : <div className="portal-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1"><DashboardGrid columns="three" className="pb-1">{projects.map((project) => <ProjectCard key={project._id} project={project} onSelect={() => onSelectProject(project)} />)}</DashboardGrid></div>}
    </DashboardPanel>
  );
}
