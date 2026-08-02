import type { ChangeEvent } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { Button, Select } from '../../ui';
import { REPORT_OPTIONS } from './reportDefinitions';
import type { ReportId } from './reportTypes';

export function AdminReportControls({
  selectedReportId,
  onSelectedReportChange,
  onRefresh,
  isLoading,
}: {
  selectedReportId: ReportId;
  onSelectedReportChange: (reportId: ReportId) => void;
  onRefresh: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
      <Select
        value={selectedReportId}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => onSelectedReportChange(event.target.value as ReportId)}
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
  );
}
