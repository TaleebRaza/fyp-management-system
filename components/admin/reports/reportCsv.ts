import type { ReportRow } from './reportTypes';

const quoteCsvCell = (value: unknown) => `"${String(value).replace(/"/g, '""')}"`;

export const buildCsv = (rows: ReportRow[]) => {
  const header = ['Label', 'Value', 'Note'];
  const body = rows.map((row) => [row.label, row.value, row.note || '']);

  return [header, ...body]
    .map((line) => line.map(quoteCsvCell).join(','))
    .join('\n');
};
