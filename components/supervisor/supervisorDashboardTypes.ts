import type { Session } from 'next-auth';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import type { ProjectReviewProject } from '../../types/projectReview';

export type SupervisorTheme = {
  bg: string;
  text: string;
  ring: string;
  lightBg: string;
};

export type SupervisorDashboardProps = {
  isDarkMode?: boolean;
  theme: SupervisorTheme;
  session: Session;
  showDialog?: ShowDialog;
};

export type SupervisorProject = ProjectReviewProject;

export type ProjectQueueFilter = 'all' | 'submitted' | 'review';

export type SupervisorDashboardStats = {
  assigned: number;
  submitted: number;
  approved: number;
  reviewQueue: number;
};
