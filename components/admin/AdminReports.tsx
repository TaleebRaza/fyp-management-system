import { AlertCircle, BarChart3, Download, ExternalLink, FileText, Loader2, UserCheck, Users } from 'lucide-react';
import { Button, DashboardGrid, DashboardPanel, Dialog, SectionHeader, Select, StatCard } from '../ui/SharedUI';
import { PROGRAM_MAP } from '../../config/appSettings';
import type { AdminReportsData } from './adminDashboardTypes';

const getProgramName = (program?: string) => {
  if (!program) return 'No program';
  return PROGRAM_MAP[program as keyof typeof PROGRAM_MAP] || program;
};
export type ReportOption = {
  id:
    | 'studentsPerSupervisor'
    | 'studentStatusSummary'
    | 'studentActivitySummary'
    | 'programSummary'
    | 'batchSummary'
    | 'projectStatusSummary'
    | 'projectStageSummary'
    | 'pdfReviewSummary'
    | 'finedStudents';
  label: string;
  description: string;
};

type ReportRow = {
  label: string;
  value: number;
  note?: string;
};

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
];

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const toReportRows = (data: AdminReportsData | null, reportId: ReportOption['id']): ReportRow[] => {
  if (!data) return [];

  if (reportId === 'studentsPerSupervisor') {
    return (data.studentsPerSupervisor || []).map((item) => ({
      label: item.label || 'Unknown Supervisor',
      value: Number(item.total || 0),
      note: `${Number(item.active || 0)} active, ${Number(item.deactivated || 0)} deactivated`,
    }));
  }

  if (reportId === 'studentStatusSummary') {
    return (data.studentStatusSummary || []).map((item) => ({
      label: item.label || 'No Status',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'studentActivitySummary') {
    return (data.studentActivitySummary || []).map((item) => ({
      label: item.label || 'Unknown',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'programSummary') {
    return (data.programSummary || []).map((item) => ({
      label: getProgramName(item.label || 'No Program'),
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'batchSummary') {
    return (data.batchSummary || []).map((item) => ({
      label: item.label || 'No Batch',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'projectStatusSummary') {
    return (data.projectStatusSummary || []).map((item) => ({
      label: item.label || 'Pending',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'projectStageSummary') {
    return (data.projectStageSummary || []).map((item) => ({
      label: item.label || 'PROPOSAL',
      value: Number(item.total || 0),
    }));
  }

  if (reportId === 'finedStudents') {
    return (data.finedStudents || []).map((item) => ({
      label: item.label || 'Unknown Student',
      value: Number(item.fineAmount || 0),
      note: `${item.fineBreakdown || `${Number(item.daysLate || 0)} day(s) late`} · ${item.program || 'No Program'} · ${item.batch || 'No Batch'}`,
    }));
  }

  return (data.pdfReviewSummary || []).map((item) => ({
    label: item.label || 'Unknown',
    value: Number(item.total || 0),
  }));
};

export const buildCsv = (rows: ReportRow[]) => {
  const header = ['Label', 'Value', 'Note'];
  const body = rows.map((row) => [row.label, row.value, row.note || '']);

  return [header, ...body]
    .map((line) =>
      line
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    )
    .join('\n');
};

export const downloadTextFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const buildReportHtml = (data: AdminReportsData, report: ReportOption, rows: ReportRow[]) => {
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString()
    : new Date().toLocaleString();
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const totals = data?.totals || {};
  const chartRows = rows
    .map((row) => {
      const width = Math.max((row.value / maxValue) * 100, row.value > 0 ? 4 : 0);

      return `
        <div class="bar-row">
          <div class="bar-label">${escapeHtml(row.label)}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${width}%"></div>
          </div>
          <div class="bar-value">${row.value}</div>
        </div>
        ${row.note ? `<div class="bar-note">${escapeHtml(row.note)}</div>` : ''}
      `;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(report.label)} - FYP Portal Report</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; background: #f4f4f5; color: #18181b; font-family: Arial, sans-serif; }
    .page { max-width: 1040px; margin: 0 auto; padding: 32px 18px; }
    .header { border-radius: 22px; background: #18181b; color: #fff; padding: 28px; }
    .eyebrow { margin: 0 0 8px; color: #a1a1aa; font-size: 12px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 30px; line-height: 1.2; }
    .description { margin: 10px 0 0; color: #d4d4d8; font-size: 14px; line-height: 1.6; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #e4e4e7; background: #fff; border-radius: 18px; padding: 16px; }
    .card-label { margin: 0; color: #71717a; font-size: 12px; font-weight: 700; }
    .card-value { margin: 6px 0 0; font-size: 26px; font-weight: 900; }
    .chart { border: 1px solid #e4e4e7; background: #fff; border-radius: 22px; padding: 18px; }
    .bar-row { display: grid; grid-template-columns: 220px 1fr 60px; gap: 12px; align-items: center; margin-top: 12px; }
    .bar-label { font-size: 13px; font-weight: 800; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { height: 20px; border-radius: 999px; background: #f4f4f5; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; background: #2563eb; }
    .bar-value { font-size: 13px; font-weight: 900; text-align: right; }
    .bar-note { margin: 3px 0 0 232px; color: #71717a; font-size: 12px; }
    .table { width: 100%; border-collapse: collapse; margin-top: 18px; overflow: hidden; border-radius: 16px; }
    th, td { border-bottom: 1px solid #e4e4e7; padding: 11px 10px; text-align: left; font-size: 13px; }
    th { background: #fafafa; color: #3f3f46; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    @media (max-width: 760px) { .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bar-row { grid-template-columns: 1fr; gap: 6px; } .bar-value { text-align: left; } .bar-note { margin-left: 0; } }
  </style>
</head>
<body>
  <main class="page">
    <section class="header">
      <p class="eyebrow">FYP Portal Report</p>
      <h1>${escapeHtml(report.label)}</h1>
      <p class="description">${escapeHtml(report.description)}</p>
      <p class="description">Generated on ${escapeHtml(generatedAt)}. This report was created in the browser and was not saved to portal storage.</p>
    </section>
    <section class="summary">
      <div class="card"><p class="card-label">Students</p><p class="card-value">${Number(totals.students || 0)}</p></div>
      <div class="card"><p class="card-label">Supervisors</p><p class="card-value">${Number(totals.supervisors || 0)}</p></div>
      <div class="card"><p class="card-label">Projects</p><p class="card-value">${Number(totals.projects || 0)}</p></div>
      <div class="card"><p class="card-label">Review Queue</p><p class="card-value">${Number(totals.reviewQueue || 0)}</p></div>
    </section>
    <section class="chart">
      ${rows.length === 0 ? '<p>No data available for this report.</p>' : chartRows}
      <table class="table">
        <thead><tr><th>Label</th><th>Value</th><th>Note</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (row) => `<tr><td>${escapeHtml(row.label)}</td><td>${row.value}</td><td>${escapeHtml(row.note || '')}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
};

export function AdminReportsDialog({
  open,
  onClose,
  isLoading,
  data,
  selectedReportId,
  onSelectedReportChange,
  selectedReport,
  rows,
  onRefresh,
  onDownloadCsv,
  onDownloadHtml,
  onOpenReport,
}: {
  open: boolean;
  onClose: () => void;
  isLoading: boolean;
  data: AdminReportsData | null;
  selectedReportId: ReportOption['id'];
  onSelectedReportChange: (reportId: ReportOption['id']) => void;
  selectedReport: ReportOption;
  rows: ReportRow[];
  onRefresh: () => void;
  onDownloadCsv: () => void;
  onDownloadHtml: () => void;
  onOpenReport: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Admin Reports"
      description="Open reports in a temporary browser tab, or download HTML/CSV only when needed. Nothing is saved to portal storage."
      size="xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" disabled={!data || rows.length === 0} onClick={onDownloadCsv}>
            <Download size={16} />
            CSV
          </Button>
          <Button variant="outline" disabled={!data || rows.length === 0} onClick={onDownloadHtml}>
            <FileText size={16} />
            HTML
          </Button>
          <Button disabled={!data || rows.length === 0} onClick={onOpenReport}>
            <ExternalLink size={16} />
            Open Report
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex min-h-80 flex-col items-center justify-center">
          <Loader2 className="mb-3 animate-spin text-[var(--color-accent)]" size={36} />
          <p className="text-sm font-bold text-[var(--color-text)]">Loading reports...</p>
        </div>
      ) : !data ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
          <BarChart3 className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
          <p className="text-sm font-bold text-[var(--color-text)]">No report data loaded</p>
          <Button className="mt-4" onClick={onRefresh}>Load Reports</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <Select
              value={selectedReportId}
              onChange={(event) => onSelectedReportChange(event.target.value as ReportOption['id'])}
              aria-label="Select report type"
            >
              {REPORT_OPTIONS.map((report) => (
                <option key={report.id} value={report.id}>{report.label}</option>
              ))}
            </Select>

            <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <BarChart3 size={16} />}
              Refresh Data
            </Button>
          </div>

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

          <DashboardPanel className="bg-[var(--color-surface-muted)]">
            <SectionHeader
              title={selectedReport.label}
              description={`${selectedReport.description} Generated ${new Date(data.generatedAt || '').toLocaleString()}.`}
            />

            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
                <BarChart3 className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
                <p className="text-sm font-bold text-[var(--color-text)]">No data available for this report</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => {
                  const maxValue = Math.max(...rows.map((item) => item.value), 1);
                  const width = Math.max((row.value / maxValue) * 100, row.value > 0 ? 4 : 0);

                  return (
                    <div key={row.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[var(--color-text)]">{row.label}</p>
                          {row.note && <p className="truncate text-xs font-semibold text-[var(--color-text-muted)]">{row.note}</p>}
                        </div>
                        <span className="text-sm font-black text-[var(--color-text)]">{row.value}</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-[var(--color-border)]">
                        <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardPanel>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm leading-6 text-[var(--color-text-muted)]">
            Reports are generated from aggregated counts returned by the API. Downloaded HTML and CSV files are created in your browser with Blob URLs, so they do not consume R2 storage or create saved report files on Vercel.
          </div>
        </div>
      )}
    </Dialog>
  );
}
