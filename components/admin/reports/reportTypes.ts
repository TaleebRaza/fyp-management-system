export type ReportId =
  | 'studentsPerSupervisor'
  | 'studentStatusSummary'
  | 'studentActivitySummary'
  | 'programSummary'
  | 'batchSummary'
  | 'projectStatusSummary'
  | 'projectStageSummary'
  | 'pdfReviewSummary'
  | 'finedStudents'
  | 'collectedFineStudents'
  | 'supervisorLoginCounts';

export type ReportOption = {
  id: ReportId;
  label: string;
  description: string;
};

export type ReportRow = {
  label: string;
  value: number;
  note?: string;
};
