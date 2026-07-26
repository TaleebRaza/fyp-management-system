import { Download, FileText, Loader2, Search } from 'lucide-react';
import { Button, DashboardGrid, DashboardPanel, EmptyState, SectionHeader, Select, StyledInput } from '../ui/SharedUI';
import SupervisorProjectCard from './SupervisorProjectCard';
import type { ProjectQueueFilter, SupervisorProject } from './supervisorDashboardTypes';

export default function SupervisorProjectsSection({
  title,
  description,
  queueFilter,
  onClearQueueFilter,
  isExporting,
  onExport,
  search,
  onSearchChange,
  batchFilter,
  onBatchFilterChange,
  batches,
  projects,
  emptyState,
  onOpenProject,
}: {
  title: string;
  description: string;
  queueFilter: ProjectQueueFilter;
  onClearQueueFilter: () => void;
  isExporting: boolean;
  onExport: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  batchFilter: string;
  onBatchFilterChange: (value: string) => void;
  batches: string[];
  projects: SupervisorProject[];
  emptyState: { title: string; description: string };
  onOpenProject: (project: SupervisorProject) => void;
}) {
  return (
    <DashboardPanel className="flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      <SectionHeader
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap gap-2">
            {queueFilter !== 'all' && <Button variant="outline" onClick={onClearQueueFilter}>Clear queue filter</Button>}
            <Button variant="outline" onClick={onExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </Button>
          </div>
        }
      />

      <div className="mb-5 grid shrink-0 gap-3 lg:grid-cols-[1fr_14rem]">
        <StyledInput icon={Search} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by student, roll number, title, domain, status..." />
        <Select value={batchFilter} onChange={(event) => onBatchFilterChange(event.target.value)}>
          <option value="All">All Batches</option>
          {batches.map((batch) => <option key={batch} value={batch}>{batch}</option>)}
        </Select>
      </div>

      {projects.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState title={emptyState.title} description={emptyState.description} icon={<FileText size={28} />} />
        </div>
      ) : (
        <div className="portal-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <DashboardGrid columns="three" className="pb-1">
            {projects.map((project) => <SupervisorProjectCard key={project._id} project={project} onOpen={onOpenProject} />)}
          </DashboardGrid>
        </div>
      )}
    </DashboardPanel>
  );
}
