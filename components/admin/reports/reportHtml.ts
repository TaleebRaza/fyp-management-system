import type { AdminReportsData } from '../adminDashboardTypes';
import type { ReportOption, ReportRow } from './reportTypes';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const buildReportHtml = (data: AdminReportsData, report: ReportOption, rows: ReportRow[]) => {
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleString()
    : new Date().toLocaleString();
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const totalCollected = report.id === 'collectedFineStudents'
    ? rows.reduce((sum, row) => sum + row.value, 0)
    : null;
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
      ${totalCollected !== null ? `<p class="description">Total collected: PKR ${totalCollected.toLocaleString()}</p>` : ''}
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
