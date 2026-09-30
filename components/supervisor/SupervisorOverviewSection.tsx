import { CheckCircle, ChevronRight, Download, FileText, LayoutDashboard, Loader2, Users } from 'lucide-react';
import { Badge, Button } from '../ui';
import { getMemberNames, getStatusLabel, getStatusVariant } from './SupervisorProjectCard';
import type { ProjectQueueFilter, SupervisorDashboardStats, SupervisorProject, SupervisorTheme } from './supervisorDashboardTypes';

export default function SupervisorOverviewSection({
  stats,
  recentProjects,
  myMigrationCode,
  isExporting,
  onExport,
  onOpenProjects,
  onOpenProject,
}: {
  stats: SupervisorDashboardStats;
  recentProjects: SupervisorProject[];
  myMigrationCode: string;
  isDarkMode: boolean;
  theme: SupervisorTheme;
  isExporting: boolean;
  onExport: () => void;
  onOpenProjects: (filter: ProjectQueueFilter) => void;
  onOpenProject: (project: SupervisorProject) => void;
}) {
  return (
    <div className="portal-bento">
      <button
        type="button"
        onClick={() => onOpenProjects('review')}
        className="portal-bento-tile portal-bento-accent p-5 text-left md:col-span-7"
      >
        <p className="portal-eyebrow">Needs attention</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-black tracking-tight text-[var(--color-text)]">{stats.reviewQueue}</p>
            <p className="mt-1 text-sm font-extrabold text-[var(--color-text)]">documents waiting for review</p>
            <p className="mt-2 max-w-lg text-xs leading-5 text-[var(--color-text-muted)]">Open the review queue and make decisions without scanning every assigned project.</p>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-black"><LayoutDashboard size={20} /></span>
        </div>
      </button>

      <section className="portal-bento-tile p-5 md:col-span-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="portal-eyebrow">Migration code</p>
            <p className="mt-2 font-mono text-2xl font-black tracking-[0.16em] text-[var(--color-text)]">{myMigrationCode || '—'}</p>
          </div>
          <Users size={20} className="text-[var(--color-text-soft)]" />
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">Share this code only when another supervisor needs to transfer a student to you.</p>
      </section>

      <button type="button" onClick={() => onOpenProjects('all')} className="portal-bento-tile p-4 text-left md:col-span-3">
        <p className="portal-eyebrow">Assigned teams</p>
        <p className="mt-1 text-2xl font-black text-[var(--color-text)]">{stats.assigned}</p>
        <div className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]"><Users size={14} />All projects</div>
      </button>
      <button type="button" onClick={() => onOpenProjects('submitted')} className="portal-bento-tile p-4 text-left md:col-span-3">
        <p className="portal-eyebrow">New documents</p>
        <p className="mt-1 text-2xl font-black text-[var(--color-text)]">{stats.submitted}</p>
        <div className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]"><FileText size={14} />Submitted</div>
      </button>
      <button type="button" onClick={() => onOpenProjects('approved')} className="portal-bento-tile p-4 text-left md:col-span-3">
        <p className="portal-eyebrow">Approved</p>
        <p className="mt-1 text-2xl font-black text-[var(--color-text)]">{stats.approved}</p>
        <div className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]"><CheckCircle size={14} />Completed decisions</div>
      </button>
      <section className="portal-bento-tile p-4 md:col-span-3">
        <p className="portal-eyebrow">Export</p>
        <p className="mt-1 text-sm font-extrabold text-[var(--color-text)]">Project summary</p>
        <Button className="mt-3 w-full" variant="outline" onClick={onExport} disabled={isExporting}>
          {isExporting ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
          {isExporting ? 'Exporting...' : 'Download PDF'}
        </Button>
      </section>

      <section className="portal-bento-tile p-5 md:col-span-12">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="portal-eyebrow">Recent teams</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-[var(--color-text)]">Assigned projects</h2>
          </div>
          <Button variant="ghost" onClick={() => onOpenProjects('all')}>View all <ChevronRight size={15} /></Button>
        </div>

        {recentProjects.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-muted)]">Assigned projects will appear here.</div>
        ) : (
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {recentProjects.map((project) => (
              <button key={project._id} type="button" onClick={() => onOpenProject(project)} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-left hover:bg-[var(--color-surface)]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold text-[var(--color-text)]">{project.projectTitle || 'Project details not submitted yet'}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{getMemberNames(project)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={getStatusVariant(project.status)}>{getStatusLabel(project.status)}</Badge>
                  <ChevronRight size={15} className="text-[var(--color-text-soft)]" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
