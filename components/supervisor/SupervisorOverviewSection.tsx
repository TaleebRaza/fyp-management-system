import { CheckCircle, ChevronRight, Download, FileText, LayoutDashboard, Loader2, Users } from 'lucide-react';
import BroadcastWidget from '../dashboards/BroadcastWidget';
import { AvatarBadge, Badge, Button, DashboardGrid, DashboardPanel, EmptyState, SectionHeader, StatCard } from '../ui';
import { getMemberNames, getStatusVariant } from './SupervisorProjectCard';
import type { ProjectQueueFilter, SupervisorDashboardStats, SupervisorProject, SupervisorTheme } from './supervisorDashboardTypes';

export default function SupervisorOverviewSection({
  stats,
  recentProjects,
  myMigrationCode,
  isDarkMode,
  theme,
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
    <div className="space-y-7 sm:space-y-6">
      <DashboardGrid>
        <StatCard label="Assigned Teams" value={stats.assigned} hint="All assigned teams." icon={<Users size={20} />} onClick={() => onOpenProjects('all')} />
        <StatCard label="Submitted Projects" value={stats.submitted} hint="Teams with a PDF attached. Click to filter." icon={<FileText size={20} />} onClick={() => onOpenProjects('submitted')} />
        <StatCard label="Review Queue" value={stats.reviewQueue} hint="Submitted projects waiting for your decision. Click to filter." icon={<LayoutDashboard size={20} />} onClick={() => onOpenProjects('review')} />
        <StatCard label="Approved" value={stats.approved} hint="Projects already approved." icon={<CheckCircle size={20} />} />
      </DashboardGrid>

      <div className="grid gap-7 sm:gap-6 xl:grid-cols-[1fr_22rem]">
        <DashboardPanel>
          <SectionHeader
            title="Supervisor Work Queue"
            description="Recent assigned teams that need your attention."
            action={<Button variant="outline" onClick={() => onOpenProjects('all')}>View All Projects<ChevronRight size={16} /></Button>}
          />
          {recentProjects.length === 0 ? (
            <EmptyState title="No projects found" description="Assigned projects will appear here when students select you as supervisor." icon={<FileText size={28} />} />
          ) : (
            <div className="space-y-3">
              {recentProjects.map((project) => (
                <button key={project._id} type="button" onClick={() => onOpenProject(project)} className="flex w-full flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-left transition-colors hover:bg-[var(--color-surface)] sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <AvatarBadge name={getMemberNames(project)} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--color-text)]">{getMemberNames(project)}</p>
                      <p className="truncate text-xs text-[var(--color-text-muted)]">{project.projectTitle || 'Project details not submitted yet'}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={getStatusVariant(project.status)}>{project.status || 'Pending'}</Badge>
                    <ChevronRight size={16} className="text-[var(--color-text-muted)]" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </DashboardPanel>

        <DashboardPanel>
          <SectionHeader title="Supervisor Tools" description="Quick actions for communication and reporting." />
          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Your Migration Code</p>
              <p className="mt-2 font-mono text-2xl font-bold tracking-widest text-[var(--color-text)]">{myMigrationCode}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Share this only when another supervisor needs to transfer a team to you.</p>
            </div>
            <div className="grid gap-2">
              <BroadcastWidget isDarkMode={isDarkMode} theme={theme} />
              <Button variant="outline" onClick={onExport} disabled={isExporting}>
                {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                {isExporting ? 'Exporting...' : 'Export Filtered Excel'}
              </Button>
            </div>
          </div>
        </DashboardPanel>
      </div>
    </div>
  );
}
