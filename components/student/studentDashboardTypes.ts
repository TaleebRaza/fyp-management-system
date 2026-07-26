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
