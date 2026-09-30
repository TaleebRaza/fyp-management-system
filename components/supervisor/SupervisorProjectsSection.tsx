import type { ReactNode } from 'react';
import { Download, FileText, Loader2, Search } from 'lucide-react';
import { Button, DashboardGrid, DashboardPanel, EmptyState, SectionHeader, Select, StyledInput } from '../ui';
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
  secondaryFilterValue,
  onSecondaryFilterChange,
  secondaryFilterOptions = [],
  secondaryFilterLabel,
  projects,
  emptyState,
  onOpenProject,
  headerActions,
  compactCards = false,
  readOnly = false,
  highlightedProjectId,
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
  secondaryFilterValue?: string;
  onSecondaryFilterChange?: (value: string) => void;
  secondaryFilterOptions?: string[];
  secondaryFilterLabel?: string;
  projects: SupervisorProject[];
  emptyState: { title: string; description: string };
  onOpenProject: (project: SupervisorProject) => void;
  headerActions?: ReactNode;
  compactCards?: boolean;
  readOnly?: boolean;
  highlightedProjectId?: string | null;
}) {
  const hasSecondaryFilter = Boolean(secondaryFilterLabel && onSecondaryFilterChange);

  return (
    <DashboardPanel className="flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      <SectionHeader
        title={title}
        description={description}
        action={
          <div className="flex flex-wrap gap-2">
            {!hideQueueFilterClear && queueFilter !== 'all' && onClearQueueFilter && <Button variant="outline" onClick={onClearQueueFilter}>Clear filter</Button>}
            {onExport && <Button variant="outline" onClick={onExport} disabled={isExporting}>
              {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
              {isExporting ? 'Exporting...' : 'Download PDF'}
            </Button>}
            {headerActions}
          </div>
        }
      />

      <div className={`mb-4 grid shrink-0 gap-2 ${hasSecondaryFilter ? 'lg:grid-cols-[minmax(0,1fr)_12rem_12rem]' : 'lg:grid-cols-[minmax(0,1fr)_14rem]'}`}>
        <StyledInput icon={Search} value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search team, roll number, project..." />
        <Select value={filterValue} onChange={(event) => onFilterChange(event.target.value)} aria-label={`Filter by ${filterLabel.toLowerCase()}`}>
          <option value="All">All {filterLabel}s</option>
          {filterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </Select>
        {hasSecondaryFilter && (
          <Select value={secondaryFilterValue || ''} onChange={(event) => onSecondaryFilterChange?.(event.target.value)} aria-label={`Filter by ${secondaryFilterLabel?.toLowerCase()}`}>
            <option value="">All {secondaryFilterLabel}s</option>
            {secondaryFilterOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </Select>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState title={emptyState.title} description={emptyState.description} icon={<FileText size={28} />} />
        </div>
      ) : (
        <div className="portal-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          <DashboardGrid columns={compactCards ? 'four' : 'three'} className="pb-1">
            {projects.map((project) => (
              <SupervisorProjectCard
                key={project._id}
                project={project}
                onOpen={onOpenProject}
                compact={compactCards}
                readOnly={readOnly}
                highlighted={project._id === highlightedProjectId}
              />
            ))}
          </DashboardGrid>
        </div>
      )}
    </DashboardPanel>
  );
}
