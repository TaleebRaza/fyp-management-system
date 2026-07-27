import type { Session } from 'next-auth';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import type { RegistrationPolicyDto } from '../../types/registrationPolicy';

export type AdminDashboardProps = {
  session: Session;
  showDialog: ShowDialog;
  registrationPolicy?: RegistrationPolicyDto;
  onRegistrationPolicyChange?: (policy: RegistrationPolicyDto) => void;
  isDarkMode?: boolean;
  theme?: unknown;
};

export type AdminSupervisor = {
  _id: string;
  name: string;
  email?: string;
  rollNo?: string;
  migrationCode?: string;
  filledSlots?: number;
  extraSlots?: number;
  maxSlots?: number;
  isFull?: boolean;
  notificationsEnabled?: boolean;
};

export type AdminStudent = {
  _id: string;
  name: string;
  email?: string;
  rollNo?: string;
  program?: string;
  batch?: string;
  semester?: string;
  status?: string;
  isActive?: boolean;
  monthlyLoginCount?: number;
};

export type StudentPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AdminStats = {
  totalStudents: number;
  loadedStudents: number;
  activeStudents: number;
  pendingStudents: number;
  supervisors: number;
};

type ReportSourceItem = {
  label?: string;
  total?: number;
  active?: number;
  deactivated?: number;
  fineAmount?: number;
  fineBreakdown?: string;
  daysLate?: number;
  program?: string;
  batch?: string;
};

export type AdminReportsData = {
  generatedAt?: string;
  totals?: {
    students?: number;
    supervisors?: number;
    projects?: number;
    reviewQueue?: number;
    finedStudents?: number;
    totalFineAmount?: number;
  };
  studentsPerSupervisor?: ReportSourceItem[];
  studentStatusSummary?: ReportSourceItem[];
  studentActivitySummary?: ReportSourceItem[];
  programSummary?: ReportSourceItem[];
  batchSummary?: ReportSourceItem[];
  projectStatusSummary?: ReportSourceItem[];
  projectStageSummary?: ReportSourceItem[];
  pdfReviewSummary?: ReportSourceItem[];
  finedStudents?: ReportSourceItem[];
  collectedFineStudents?: ReportSourceItem[];
};
