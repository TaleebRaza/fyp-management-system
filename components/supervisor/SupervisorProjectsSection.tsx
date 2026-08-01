import type { ReactNode } from 'react';
import { Download, FileText, Loader2, Search } from 'lucide-react';
import { Button, DashboardGrid, DashboardPanel, EmptyState, SectionHeader, Select, StyledInput } from '../ui/SharedUI';
import SupervisorProjectCard from './SupervisorProjectCard';
import type { ProjectQueueFilter, SupervisorProject } from './supervisorDashboardTypes';

export default function SupervisorProjectsSection({
  title,
  description,
  queueFilter,
  onClearQueueFilter,
  hideQueueFilterClear = false,
  isExporting,
  onExport,
  search,
  onSearchChange,
  filterValue,
  onFilterChange,
  filterOptions,
  filterLabel,
  projects,
  emptyState,
  onOpenProject,
  headerActions,
}: {
  title: string;
  description: string;
  queueFilter: ProjectQueueFilter;
  onClearQueueFilter?: () => void;
  hideQueueFilterClear?: boolean;
  isExporting?: boolean;
  onExport?: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: string[];
  filterLabel: string;
  projects: SupervisorProject[];
  emptyState: { title: string; description: string };
  onOpenProject: (project: SupervisorProject) => void;
  headerActions?: ReactNode;
}) {
  return (
    <DashboardPanel className="flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      <SectionHeader
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap gap-2">
            {!hideQueueFilterClear && queueFilter !== 'all' && onClearQueueFilter && <Button variant="outline" onClick={onClearQueueFilter}>Clear queue filter</Button>}
            {onExport && <Button variant="outline" onClick={onExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </Button>}
            {headerActions}
          </div>
        }
      />

      <div className="mb-5 grid shrink-0 gap-3 lg:grid-cols-[1fr_14rem]">
        <StyledInput icon={Search} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by student, roll number, title, domain, status..." />
        <Select value={filterValue} onChange={(event) => onFilterChange(event.target.value)} aria-label={`Filter by ${filterLabel.toLowerCase()}`}>
          <option value="All">All {filterLabel}s</option>
          {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
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
