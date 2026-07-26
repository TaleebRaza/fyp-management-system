import { CheckCircle, Filter, Loader2, Search, Trash2, User } from 'lucide-react';
import { PROGRAM_MAP } from '../../config/appSettings';
import { AvatarBadge, Badge, Button, DashboardPanel, SectionHeader, Select, StyledInput } from '../ui/SharedUI';
import type { AdminStudent, StudentPagination } from './adminDashboardTypes';

const getProgramName = (program?: string) => {
  if (!program) return 'No program';
  return PROGRAM_MAP[program as keyof typeof PROGRAM_MAP] || program;
};

const getStatusVariant = (status?: string): 'success' | 'danger' | 'muted' | 'warning' => {
  if (status === 'Approved') return 'success';
  if (status === 'Rejected') return 'danger';
  if (status === 'Unassigned') return 'muted';
  return 'warning';
};

export default function AdminStudentsSection({
  students,
  search,
  onSearchChange,
  studentFilter,
  onStudentFilterChange,
  filterOptions,
  batchFilter,
  onBatchFilterChange,
  batches,
  isLoading,
  pagination,
  page,
  onPageChange,
  onPromoteBatch,
  onUpdateEmail,
  onUpdateProgram,
  onUpdateBatch,
  onToggleStatus,
}: {
  students: AdminStudent[];
  search: string;
  onSearchChange: (value: string) => void;
  studentFilter: string;
  onStudentFilterChange: (value: string) => void;
  filterOptions: string[];
  batchFilter: string;
  onBatchFilterChange: (value: string) => void;
  batches: string[];
  isLoading: boolean;
  pagination: StudentPagination;
  page: number;
  onPageChange: (page: number) => void;
  onPromoteBatch: () => void;
  onUpdateEmail: (id: string, email: string, name: string) => void;
  onUpdateProgram: (id: string, program: string, name: string) => void;
  onUpdateBatch: (id: string, batch: string, name: string) => void;
  onToggleStatus: (id: string, active: boolean) => void;
}) {
  return (
    <DashboardPanel className="flex flex-col xl:h-full xl:min-h-0 xl:overflow-hidden">
      <div className="shrink-0">
        <SectionHeader
          title="Students"
          description="Search, filter, and manage student academic records."
          action={batchFilter !== 'All' ? <Button variant="accent" onClick={onPromoteBatch}>Promote {batchFilter}</Button> : null}
        />

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
            <StyledInput icon={Search} value={search} onChange={(event) => onSearchChange(event.target.value)} type="search" placeholder="Search students by name, ID, or email..." />
            <Select value={studentFilter} onChange={(event) => onStudentFilterChange(event.target.value)} aria-label="Filter students by program or status">
              {filterOptions.map((option) => <option key={option} value={option}>{Object.keys(PROGRAM_MAP).includes(option) ? option : option}</option>)}
            </Select>
            <Select value={batchFilter} onChange={(event) => onBatchFilterChange(event.target.value)} aria-label="Filter students by batch">
              <option value="All">All Batches</option>
              {batches.map((batch) => <option key={batch} value={batch}>{batch}</option>)}
            </Select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1 uppercase tracking-wide"><Filter size={13} />Active filters</span>
            <Badge variant={studentFilter === 'All' ? 'muted' : 'accent'}>{studentFilter === 'All' ? 'All Programs & Statuses' : studentFilter}</Badge>
            <Badge variant={batchFilter === 'All' ? 'muted' : 'accent'}>{batchFilter === 'All' ? 'All Batches' : batchFilter}</Badge>
          </div>
        </div>
      </div>

      <div className="portal-scrollbar mt-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
        {isLoading ? (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <Loader2 size={32} className="mb-3 animate-spin text-[var(--color-accent)]" />
            <p className="text-sm font-bold text-[var(--color-text)]">Loading students...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
            <User size={32} className="mb-3 text-[var(--color-text-muted)]" />
            <p className="text-sm font-bold text-[var(--color-text)]">No students found</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Adjust your search or filters and try again.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {students.map((student) => (
              <div key={student._id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <AvatarBadge name={student.name} className={student.isActive === false ? 'opacity-50' : ''} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className={`font-bold text-[var(--color-text)] ${student.isActive === false ? 'line-through opacity-60' : ''}`}>{student.name || 'Unnamed student'}</h3>
                        <Badge variant={getStatusVariant(student.status)}>{student.status || 'N/A'}</Badge>
                        {student.isActive === false && <Badge variant="danger">Deactivated</Badge>}
                      </div>
                      <button type="button" onClick={() => onUpdateEmail(student._id, student.email || '', student.name)} className="mt-1 break-all text-left text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                        ID: {student.rollNo || 'N/A'} · {student.email || 'Assign email'}
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => onUpdateProgram(student._id, student.program || '', student.name)} className="rounded-full bg-[var(--color-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--color-accent)]" title={`${getProgramName(student.program)} — click to edit`}>
                          {student.program || 'No program'}
                        </button>
                        <button type="button" onClick={() => onUpdateBatch(student._id, student.batch || '', student.name)} className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)]" title="Click to edit batch">
                          {student.batch || 'No batch'} · {student.semester || '7th Sem'}
                        </button>
                        {Boolean(student.monthlyLoginCount && student.monthlyLoginCount > 0) && <Badge variant="accent">{student.monthlyLoginCount} logins this month</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant={student.isActive !== false ? 'danger' : 'success'} onClick={() => onToggleStatus(student._id, student.isActive !== false)}>
                      {student.isActive !== false ? <Trash2 size={16} /> : <CheckCircle size={16} />}
                      {student.isActive !== false ? 'Deactivate' : 'Restore'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex shrink-0 flex-col gap-3 border-t border-[var(--color-border)] pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="font-semibold text-[var(--color-text-muted)]">Showing {students.length} of {pagination.total} students</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={isLoading || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
          <span className="text-sm font-bold text-[var(--color-text-muted)]">Page {pagination.total === 0 ? 0 : page} of {pagination.totalPages}</span>
          <Button variant="outline" disabled={isLoading || page >= pagination.totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
        </div>
      </div>
    </DashboardPanel>
  );
}
