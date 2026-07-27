import { BarChart3 } from 'lucide-react';
import { DashboardPanel, SectionHeader } from '../../ui/SharedUI';
import type { AdminReportsData } from '../adminDashboardTypes';
import type { ReportOption, ReportRow } from './reportTypes';

export function AdminReportPreview({
  data,
  selectedReport,
  rows,
}: {
  data: AdminReportsData;
  selectedReport: ReportOption;
  rows: ReportRow[];
}) {
  const maxValue = Math.max(...rows.map((item) => item.value), 1);
  const totalCollected = selectedReport.id === 'collectedFineStudents'
    ? rows.reduce((sum, row) => sum + row.value, 0)
    : null;

  return (
    <DashboardPanel className="bg-[var(--color-surface-muted)]">
      <SectionHeader
        title={selectedReport.label}
        description={`${selectedReport.description} Generated ${new Date(data.generatedAt || '').toLocaleString()}.`}
      />
      {totalCollected !== null && (
        <p className="text-sm font-black text-[var(--color-text)]">
          Total collected: PKR {totalCollected.toLocaleString()}
        </p>
      )}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
          <BarChart3 className="mx-auto mb-3 text-[var(--color-text-muted)]" size={32} />
          <p className="text-sm font-bold text-[var(--color-text)]">No data available for this report</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
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
  );
}
