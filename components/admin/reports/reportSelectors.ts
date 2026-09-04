import { PROGRAM_MAP } from '../../../config/appSettings';
import type { AdminReportsData } from '../adminDashboardTypes';
import type { ReportId, ReportRow } from './reportTypes';

const getProgramName = (program?: string) => {
  if (!program) return 'No program';
  return PROGRAM_MAP[program as keyof typeof PROGRAM_MAP] || program;
};

const toFineRows = (
  items: AdminReportsData['finedStudents'] | AdminReportsData['collectedFineStudents']
): ReportRow[] =>
  (items || []).map((item) => ({
    label: item.label || 'Unknown Student',
    value: Number(item.fineAmount || 0),
    note: `${item.fineBreakdown || `${Number(item.daysLate || 0)} day(s) late`} · ${item.program || 'No Program'} · ${item.batch || 'No Batch'}`,
  }));

export const toReportRows = (data: AdminReportsData | null, reportId: ReportId): ReportRow[] => {
  if (!data) return [];

  switch (reportId) {
    case 'studentsPerSupervisor':
      return (data.studentsPerSupervisor || []).map((item) => ({
        label: item.label || 'Unknown Supervisor',
        value: Number(item.total || 0),
        note: `${Number(item.active || 0)} active, ${Number(item.deactivated || 0)} deactivated`,
      }));

    case 'studentStatusSummary':
      return (data.studentStatusSummary || []).map((item) => ({
        label: item.label || 'No Status',
        value: Number(item.total || 0),
      }));

    case 'studentActivitySummary':
      return (data.studentActivitySummary || []).map((item) => ({
        label: item.label || 'Unknown',
        value: Number(item.total || 0),
      }));

    case 'programSummary':
      return (data.programSummary || []).map((item) => ({
        label: getProgramName(item.label || 'No Program'),
        value: Number(item.total || 0),
      }));

    case 'batchSummary':
      return (data.batchSummary || []).map((item) => ({
        label: item.label || 'No Batch',
        value: Number(item.total || 0),
      }));

    case 'projectStatusSummary':
      return (data.projectStatusSummary || []).map((item) => ({
        label: item.label || 'Pending',
        value: Number(item.total || 0),
      }));

    case 'projectStageSummary':
      return (data.projectStageSummary || []).map((item) => ({
        label: item.label || 'PROPOSAL',
        value: Number(item.total || 0),
      }));

    case 'supervisorLoginCounts':
      return (data.supervisorLoginCounts || []).map((item) => ({
        label: item.label || 'Unknown Supervisor',
        value: Number(item.total || 0),
        note: item.note,
      }));

    case 'finedStudents':
      return toFineRows(data.finedStudents);

    case 'collectedFineStudents':
      return toFineRows(data.collectedFineStudents);

    case 'pdfReviewSummary':
    default:
      return (data.pdfReviewSummary || []).map((item) => ({
        label: item.label || 'Unknown',
        value: Number(item.total || 0),
      }));
  }
};
