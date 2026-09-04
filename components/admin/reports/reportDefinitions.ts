import type { ReportOption } from './reportTypes';

export const REPORT_OPTIONS: ReportOption[] = [
  {
    id: 'studentsPerSupervisor',
    label: 'Students per Supervisor',
    description: 'Bar chart showing how many students are assigned to each supervisor.',
  },
  {
    id: 'studentStatusSummary',
    label: 'Student Status Summary',
    description: 'Counts students by portal status such as Pending, Approved, or Unassigned.',
  },
  {
    id: 'studentActivitySummary',
    label: 'Active vs Deactivated Students',
    description: 'Shows active and deactivated student account totals.',
  },
  {
    id: 'programSummary',
    label: 'Students by Program',
    description: 'Shows the student distribution across programs.',
  },
  {
    id: 'batchSummary',
    label: 'Students by Batch',
    description: 'Shows the student distribution across academic batches.',
  },
  {
    id: 'projectStatusSummary',
    label: 'Project Status Report',
    description: 'Shows project counts by current status.',
  },
  {
    id: 'projectStageSummary',
    label: 'Project Stage Report',
    description: 'Shows project counts by Proposal, Thesis Draft, and Final Deliverables.',
  },
  {
    id: 'pdfReviewSummary',
    label: 'PDF Submission and Review Queue',
    description: 'Shows uploaded PDFs, projects waiting for review, and approved projects.',
  },
  {
    id: 'finedStudents',
    label: 'Students Fined',
    description: 'Shows students with outstanding monetary fines and the amount still due.',
  },
  {
    id: 'collectedFineStudents',
    label: 'Fines Collected',
    description: 'Shows monetary fines verified as collected, excluding waived fines.',
  },
  {
    id: 'supervisorLoginCounts',
    label: 'Supervisor Login Activity',
    description: 'Shows how many times each supervisor has logged in this month.',
  },
];
