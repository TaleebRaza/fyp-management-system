import type { Session } from 'next-auth';
import type { ShowDialog } from '../../app/_components/PortalDialog';
import type { FineRestrictionPolicy } from '../../types/registrationPolicy';

export type WordTemplate = {
  id: string;
  title: string;
  filename: string;
  format: 'word';
  content: string;
};

export type StudentSummary = {
  name?: string;
  program?: string;
  batch?: string;
  status?: string;
  projectTitle?: string;
  projectDesc?: string;
  remarks?: string;
  lateRegistrationDays?: number;
  lateRegistrationFine?: number;
  domain?: string;
  domains?: string[];
  pdfUrl?: string;
  tools?: string;
  supervisorId?: string;
};

export type SupervisorSummary = {
  name?: string;
  email?: string;
};

export type ProjectMember = {
  _id: string;
  name: string;
  rollNo?: string;
  email?: string;
};

type StudentProjectSummary = {
  _id?: string;
  status?: string;
  stage?: string;
  domain?: string;
  domains?: string[];
  pdfUrl?: string;
  inviteCode?: string;
  maxTeamSize?: number;
  members?: ProjectMember[];
};

type SupervisorBroadcast = {
  type?: string;
  content?: string;
  supervisorName?: string;
  createdAt?: string | Date | null;
};

export type FineRestriction = {
  active?: boolean;
  isCurrentStudent?: boolean;
  member?: { name?: string; rollNo?: string };
  lateRegistrationFine?: { amount?: number; daysLate?: number };
  adminFine?: { title?: string; amount?: number; description?: string };
  totalAmount?: number;
  payment?: {
    methodLabel?: string;
    accountTitle?: string;
    accountNumber?: string;
    instructions?: string;
  };
};

export type AvailableSupervisor = {
  _id: string;
  name: string;
  filledSlots: number;
  maxSlots: number;
  capacityReady?: boolean;
  isFull?: boolean;
};

export type StudentDashboardData = {
  student?: StudentSummary;
  supervisor?: SupervisorSummary;
  project?: StudentProjectSummary;
  supervisorBroadcast?: SupervisorBroadcast | null;
  fineRestriction?: FineRestriction | null;
  teamFineRestriction?: FineRestriction | null;
  fineRestrictions?: FineRestrictionPolicy;
  projectSubmissionsOpen?: boolean;
};

export type AnnouncementItem = {
  id: string;
  source: string;
  title: string;
  type: string;
  content: string;
  tone: 'admin' | 'supervisor';
  createdAt?: string | Date | null;
};

export type SupervisorOption = {
  id: string;
  label: string;
};

export type AcademicForm = {
  program: string;
  batch: string;
};

export type StudentDashboardProps = {
  isDarkMode?: boolean;
  session: Session;
  showDialog: ShowDialog;
};
