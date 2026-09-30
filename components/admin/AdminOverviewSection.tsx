import {
  AlertCircle,
  BarChart3,
  ClipboardCheck,
  CircleDollarSign,
  GraduationCap,
  MessagesSquare,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { Button } from '../ui';
import type { RegistrationPolicyDto } from '../../types/registrationPolicy';
import type { AdminStats } from './adminDashboardTypes';

export default function AdminOverviewSection({
  stats,
  portalPaused,
  registrationPolicy,
  onOpenSupervisors,
  onOpenStudents,
  onOpenReviews,
  onOpenMessages,
  onOpenRegistration,
  onOpenFines,
  onOpenReports,
}: {
  stats: AdminStats;
  portalPaused: boolean;
  registrationPolicy?: RegistrationPolicyDto;
  onOpenSupervisors: () => void;
  onOpenStudents: () => void;
  onOpenReviews: () => void;
  onOpenMessages: () => void;
  onOpenRegistration: () => void;
  onOpenFines: () => void;
  onOpenReports: () => void;
}) {
  const registrationOpen = registrationPolicy?.isOpen !== false;
  const submissionsOpen = registrationPolicy?.projectSubmissionsOpen !== false;

  return (
    <div className="portal-bento">
      <section className="portal-bento-tile portal-bento-accent p-5 md:col-span-7">
        <p className="portal-eyebrow">Portal health</p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-[var(--color-text)]">{portalPaused ? 'Portal paused' : 'Portal operating normally'}</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-muted)]">
              Registration is {registrationOpen ? 'open' : 'closed'} and project submissions are {submissionsOpen ? 'open' : 'closed'}.
            </p>
          </div>
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${portalPaused ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'}`}>
            <ShieldCheck size={21} />
          </span>
        </div>
      </section>

      <section className="portal-bento-tile p-5 md:col-span-5">
        <p className="portal-eyebrow">Needs attention</p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-black text-[var(--color-text)]">{stats.pendingStudents}</p>
            <p className="mt-1 text-sm font-extrabold text-[var(--color-text)]">pending student records in the current view</p>
          </div>
          <AlertCircle size={22} className="text-[var(--color-accent)]" />
        </div>
        <Button className="mt-4" variant="outline" onClick={onOpenStudents}>Review students</Button>
      </section>

      <button type="button" onClick={onOpenStudents} className="portal-bento-tile p-4 text-left md:col-span-3">
        <p className="portal-eyebrow">Students</p>
        <p className="mt-1 text-2xl font-black text-[var(--color-text)]">{stats.totalStudents}</p>
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]"><GraduationCap size={14} />{stats.activeStudents} active in loaded records</p>
      </button>
      <button type="button" onClick={onOpenSupervisors} className="portal-bento-tile p-4 text-left md:col-span-3">
        <p className="portal-eyebrow">Supervisors</p>
        <p className="mt-1 text-2xl font-black text-[var(--color-text)]">{stats.supervisors}</p>
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]"><UserCheck size={14} />Manage capacity and access</p>
      </button>
      <button type="button" onClick={onOpenReviews} className="portal-bento-tile p-4 text-left md:col-span-3">
        <p className="portal-eyebrow">Project reviews</p>
        <p className="mt-1 text-sm font-black text-[var(--color-text)]">Open review queue</p>
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]"><ClipboardCheck size={14} />Review submitted work</p>
      </button>
      <button type="button" onClick={onOpenReports} className="portal-bento-tile p-4 text-left md:col-span-3">
        <p className="portal-eyebrow">Reports</p>
        <p className="mt-1 text-sm font-black text-[var(--color-text)]">Portal insights</p>
        <p className="mt-2 flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)]"><BarChart3 size={14} />Generate on demand</p>
      </button>

      <section className="portal-bento-tile p-5 md:col-span-12">
        <p className="portal-eyebrow">Quick management</p>
        <h2 className="mt-1 text-lg font-black tracking-tight text-[var(--color-text)]">Open a focused workspace</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Button variant="outline" onClick={onOpenSupervisors}><Users size={15} />Supervisors</Button>
          <Button variant="outline" onClick={onOpenStudents}><GraduationCap size={15} />Students</Button>
          <Button variant="outline" onClick={onOpenMessages}><MessagesSquare size={15} />Messages</Button>
          <Button variant="outline" onClick={onOpenRegistration}><ShieldCheck size={15} />Registration</Button>
          <Button variant="outline" onClick={onOpenFines}><CircleDollarSign size={15} />Fines</Button>
        </div>
      </section>
    </div>
  );
}
