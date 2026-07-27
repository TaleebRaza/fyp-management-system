import { AlertCircle, FileText, UserCheck, Users } from 'lucide-react';
import { DashboardGrid, StatCard } from '../../ui/SharedUI';
import type { AdminReportsData } from '../adminDashboardTypes';

export function AdminReportSummary({ data }: { data: AdminReportsData }) {
  return (
    <DashboardGrid columns="four">
      <StatCard label="Students" value={data.totals?.students || 0} hint="Total student accounts" icon={<Users size={18} />} />
      <StatCard label="Supervisors" value={data.totals?.supervisors || 0} hint="Total supervisor accounts" icon={<UserCheck size={18} />} />
      <StatCard label="Projects" value={data.totals?.projects || 0} hint="Total project records" icon={<FileText size={18} />} />
      <StatCard label="Review Queue" value={data.totals?.reviewQueue || 0} hint="PDF projects not approved" icon={<AlertCircle size={18} />} />
      <StatCard
        label="Students Fined"
        value={data.totals?.finedStudents || 0}
        hint={`Total amount: PKR ${Number(data.totals?.totalFineAmount || 0).toLocaleString()}`}
        icon={<AlertCircle size={18} />}
      />
    </DashboardGrid>
  );
}
