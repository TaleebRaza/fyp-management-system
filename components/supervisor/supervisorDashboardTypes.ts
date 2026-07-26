import type { Session } from 'next-auth';
import type { ShowDialog } from '../../app/_components/PortalDialog';

export type SupervisorTheme = {
  name?: string;
  bg?: string;
  text?: string;
  ring?: string;
  lightBg?: string;
  border?: string;
};

export type SupervisorDashboardProps = {
  isDarkMode?: boolean;
  theme?: SupervisorTheme;
  session: Session;
  showDialog?: ShowDialog;
};

type SupervisorProjectMember = {
  _id?: string;
  name?: string;
  rollNo?: string;
  email?: string;
  program?: string;
};

export type SupervisorProject = {
  _id: string;
  triggerStudentId: string;
  members?: SupervisorProjectMember[];
  program?: string;
  batch?: string;
  semester?: string;
  projectTitle?: string;
  projectDesc?: string;
  domain?: string;
  domains?: string[];
  tools?: string;
  status?: string;
  stage?: string;
  pdfUrl?: string;
  maxTeamSize?: number;
};

export type ProjectQueueFilter = 'all' | 'submitted' | 'review';

export type SupervisorDashboardStats = {
  assigned: number;
  submitted: number;
  approved: number;
  reviewQueue: number;
};
