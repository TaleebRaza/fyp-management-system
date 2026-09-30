import { ArrowRight } from 'lucide-react';
import type { RegistrationPolicyDto } from '../../types/registrationPolicy';

export default function AdminOverviewSection({
  students,
  supervisors,
  portalPaused,
  registrationPolicy,
  projects,
  reviewQueue,
  summaryLoading,
  summaryError,
  onOpenStudents,
  onOpenSupervisors,
  onOpenReviews,
  onOpenRegistration,
  onOpenPortal,
  onOpenReports,
}: {
  students?: number;
  supervisors?: number;
  portalPaused: boolean;
  registrationPolicy?: RegistrationPolicyDto;
  projects?: number;
  reviewQueue?: number;
  summaryLoading: boolean;
  summaryError: boolean;
  onOpenStudents: () => void;
  onOpenSupervisors: () => void;
  onOpenReviews: () => void;
  onOpenRegistration: () => void;
  onOpenPortal: () => void;
  onOpenReports: () => void;
}) {
  const states = [
    { label: 'Portal', value: portalPaused ? 'Paused' : 'Open' },
    { label: 'Registration', value: registrationPolicy?.isOpen === false ? 'Closed' : 'Open' },
    { label: 'Submissions', value: registrationPolicy?.projectSubmissionsOpen === false ? 'Closed' : 'Open' },
  ];
  const reportValue = (value?: number) => summaryLoading && value === undefined ? 'Loading…' : summaryError || value === undefined ? 'Unavailable' : value.toLocaleString();
  const figures = [
    { label: 'Students', value: reportValue(students), onClick: onOpenStudents },
    { label: 'Supervisors', value: reportValue(supervisors), onClick: onOpenSupervisors },
    { label: 'Projects', value: reportValue(projects), onClick: onOpenReports },
    { label: 'Waiting for review', value: reportValue(reviewQueue), onClick: onOpenReviews },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Portal overview</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Current portal settings and academic activity.</p>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-5">
          {states.map((state) => <div key={state.label} className="flex items-center gap-2 text-base"><span className="text-[var(--color-text-muted)]">{state.label}</span><strong className="font-semibold">{state.value}</strong></div>)}
          <button type="button" onClick={onOpenRegistration} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Registration settings <ArrowRight size={14} /></button>
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <h3 className="sr-only">Portal figures</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {figures.map((figure) => <button key={figure.label} type="button" onClick={figure.onClick} className="min-w-0 border-b border-r border-[var(--color-border)] p-5 text-left last:border-r-0 hover:bg-[var(--color-surface-muted)] sm:p-7 lg:border-b-0">
            <span className="block text-sm text-[var(--color-text-muted)]">{figure.label}</span>
            <strong className="mt-3 block truncate text-3xl font-semibold tabular-nums" aria-live="polite">{figure.value}</strong>
          </button>)}
        </div>
      </section>
      <section>
        <h3 className="text-base font-semibold">Needs attention</h3>
        <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {portalPaused && <button type="button" onClick={onOpenPortal} className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border)] p-4 text-left text-sm hover:bg-[var(--color-surface-muted)]"><span>The portal is paused. Check the reason and reopen it when ready.</span><ArrowRight size={16} /></button>}
          {typeof reviewQueue === 'number' && reviewQueue > 0 && <button type="button" onClick={onOpenReviews} className="flex w-full items-center justify-between gap-3 border-b border-[var(--color-border)] p-4 text-left text-sm hover:bg-[var(--color-surface-muted)]"><span>{reviewQueue} project {reviewQueue === 1 ? 'submission needs' : 'submissions need'} review.</span><ArrowRight size={16} /></button>}
          {!portalPaused && !(typeof reviewQueue === 'number' && reviewQueue > 0) && <p className="p-4 text-sm text-[var(--color-text-muted)]">{summaryLoading ? 'Checking review activity…' : summaryError ? 'Review activity is unavailable. Open Reports to retry.' : 'No items need attention from the available portal signals.'}</p>}
        </div>
      </section>
    </div>
  );
}
