import { BarChart3, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { Button, Dialog } from '../../ui/SharedUI';
import type { AdminReportsData } from '../adminDashboardTypes';
import { AdminReportControls } from './AdminReportControls';
import { AdminReportPreview } from './AdminReportPreview';
import { AdminReportSummary } from './AdminReportSummary';
import type { ReportOption, ReportRow } from './reportTypes';

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
          <AdminReportControls
            selectedReportId={selectedReportId}
            onSelectedReportChange={onSelectedReportChange}
            onRefresh={onRefresh}
            isLoading={isLoading}
          />
          <AdminReportSummary data={data} />
          <AdminReportPreview data={data} selectedReport={selectedReport} rows={rows} />
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4 text-sm leading-6 text-[var(--color-text-muted)]">
            Reports are generated from aggregated counts returned by the API. Downloaded HTML and CSV files are created in your browser with Blob URLs, so they do not consume R2 storage or create saved report files on Vercel.
          </div>
        </div>
      )}
    </Dialog>
  );
}
