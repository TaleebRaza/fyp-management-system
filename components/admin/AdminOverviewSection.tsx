import { AlertCircle, BarChart3, GraduationCap, ShieldCheck, UserCheck, Users } from 'lucide-react';
import { Button, DashboardGrid, DashboardPanel, SectionHeader, StatCard } from '../ui';
import type { AdminStats } from './adminDashboardTypes';

export default function AdminOverviewSection({
  stats,
  onOpenSupervisors,
  onOpenStudents,
  onOpenReports,
}: {
  stats: AdminStats;
  onOpenSupervisors: () => void;
  onOpenStudents: () => void;
  onOpenReports: () => void;
}) {
  return (
    <>
      <DashboardGrid>
        <StatCard label="Total Students" value={stats.totalStudents} hint={`${stats.loadedStudents} visible in current view`} icon={<Users size={18} />} />
        <StatCard label="Supervisors" value={stats.supervisors} hint="Active supervisor accounts" icon={<UserCheck size={18} />} />
        <StatCard label="Active Students" value={stats.activeStudents} hint="Based on loaded student records" icon={<ShieldCheck size={18} />} />
        <StatCard label="Pending Items" value={stats.pendingStudents} hint="Students not marked approved" icon={<AlertCircle size={18} />} />
      </DashboardGrid>

      <section>
        <SectionHeader title="Management" description="Core administration areas for accounts, students, and reports." />
        <DashboardGrid columns="three">
          <DashboardPanel>
            <div className="flex h-full flex-col">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)]"><Users size={20} /></div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Supervisor Management</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Create supervisor accounts, manage email, notification status, and access.</p>
              <Button className="mt-5 w-full" onClick={onOpenSupervisors}>Open Supervisors</Button>
            </div>
          </DashboardPanel>

          <DashboardPanel>
            <div className="flex h-full flex-col">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)]"><GraduationCap size={20} /></div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Student Management</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Search students, update batch/program/email, and manage account status.</p>
              <Button className="mt-5 w-full" onClick={onOpenStudents}>Open Students</Button>
            </div>
          </DashboardPanel>

          <DashboardPanel>
            <div className="flex h-full flex-col">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary)] text-[var(--color-on-primary)]"><BarChart3 size={20} /></div>
              <h3 className="text-base font-bold text-[var(--color-text)]">Reports</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">Generate charts for supervisors, students, projects, and review queues without using storage.</p>
              <Button className="mt-5 w-full" onClick={onOpenReports}>Generate Reports</Button>
            </div>
          </DashboardPanel>
        </DashboardGrid>
      </section>
    </>
  );
}
