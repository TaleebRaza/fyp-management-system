import {
  AlertCircle,
  BarChart3,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  UserCheck,
  Users,
} from 'lucide-react';

import { type ReportId, type ReportOption, type ReportRow } from '../../../lib/adminReports';
import { Button, DashboardGrid, DashboardPanel, Dialog, SectionHeader, Select, StatCard } from '../../ui/SharedUI';

type ReportsDialogProps = {
  open: boolean;
  onClose: () => void;
  isLoading: boolean;
  hasReports: boolean;
  totals: Record<string, unknown>;
  generatedAt: unknown;
  reportOptions: ReportOption[];
  selectedReport: ReportOption;
  rows: ReportRow[];
  onSelectReport: (id: ReportId) => void;
  onLoad: () => void;
  onDownloadCsv: () => void;
  onDownloadHtml: () => void;
  onOpenReport: () => void;
};

export function ReportsDialog({
  open,
  onClose,
  isLoading,
  hasReports,
  totals,
  generatedAt,
  reportOptions,
  selectedReport,
  rows,
  onSelectReport,
  onLoad,
  onDownloadCsv,
  onDownloadHtml,
  onOpenReport,
}: ReportsDialogProps) {
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
          <Button variant="outline" disabled={!hasReports || rows.length === 0} onClick={onDownloadCsv}>
            <Download size={16} />CSV
          </Button>
          <Button variant="outline" disabled={!hasReports || rows.length === 0} onClick={onDownloadHtml}>
            <FileText size={16} />HTML
          </Button>
          <Button disabled={!hasReports || rows.length === 0} onClick={onOpenReport}>
            <ExternalLink size={16} />Open Report
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="flex min-h-80 flex-col items-center justify-center">
          <Loader2 className="mb-3 animate-spin text-[var(--color-accent)]" size={36} />
          <p className="text-sm font-bold text-[var(--color-text)]">Loading reports...</p>
        </div>
      ) : !hasReports ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface-muted)] p-8 text-center">
          <BarChart3 className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
          <p className="text-sm font-bold text-[var(--color-text)]">No report data loaded</p>
          <Button className="mt-4" onClick={onLoad}>Load Reports</Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <Select
              value={selectedReport.id}
              onChange={event => onSelectReport(event.target.value as ReportId)}
              aria-label="Select report type"
            >
              {reportOptions.map(report => <option key={report.id} value={report.id}>{report.label}</option>)}
            </Select>
            <Button variant="outline" onClick={onLoad}>Refresh Data</Button>
          </div>

          <DashboardGrid columns="four">
            <StatCard label="Students" value={Number(totals.students || 0)} hint="Total student accounts" icon={<Users size={18} />} />
            <StatCard label="Supervisors" value={Number(totals.supervisors || 0)} hint="Total supervisor accounts" icon={<UserCheck size={18} />} />
            <StatCard label="Projects" value={Number(totals.projects || 0)} hint="Total project records" icon={<FileText size={18} />} />
            <StatCard label="Review Queue" value={Number(totals.reviewQueue || 0)} hint="PDF projects not approved" icon={<AlertCircle size={18} />} />
            <StatCard label="Students Fined" value={Number(totals.finedStudents || 0)} hint={`Total amount: PKR ${Number(totals.totalFineAmount || 0).toLocaleString()}`} icon={<AlertCircle size={18} />} />
          </DashboardGrid>

          <DashboardPanel className="bg-[var(--color-surface-muted)]">
            <SectionHeader title={selectedReport.label} description={`${selectedReport.description} Generated ${new Date(String(generatedAt)).toLocaleString()}.`} />
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
                <BarChart3 className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
                <p className="text-sm font-bold text-[var(--color-text)]">No data available for this report</p>
              </div>
            ) : (
              <div className="space-y-3">
                {rows.map(row => {
                  const maxValue = Math.max(...rows.map(item => item.value), 1);
                  const width = Math.max((row.value / maxValue) * 100, row.value > 0 ? 4 : 0);
                  return (
                    <div key={`${row.label}-${row.note || ''}`} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                      <div className="flex items-center justify-between gap-4 text-sm font-black text-[var(--color-text)]"><span>{row.label}</span><span>{row.value}</span></div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-surface-muted)]"><div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${width}%` }} /></div>
                      {row.note && <p className="mt-2 text-xs text-[var(--color-text-muted)]">{row.note}</p>}
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
