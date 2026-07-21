import { describe, expect, it } from 'vitest';

import { buildReportCsv, buildReportHtml, REPORT_OPTIONS, toReportRows } from '../lib/adminReports';

describe('admin reports', () => {
  it('turns supervisor totals into the established report rows', () => {
    expect(toReportRows({
      studentsPerSupervisor: [{ label: 'Dr Khan', total: 3, active: 2, deactivated: 1 }],
    }, 'studentsPerSupervisor')).toEqual([
      { label: 'Dr Khan', value: 3, note: '2 active, 1 deactivated' },
    ]);
  });

  it('creates safely quoted CSV and escaped browser-report HTML', () => {
    const rows = [{ label: 'A "quoted" <name>', value: 4, note: 'Ready & waiting' }];
    const report = REPORT_OPTIONS[0];

    expect(buildReportCsv(rows)).toContain('"A ""quoted"" <name>"');

    const html = buildReportHtml({ generatedAt: '2026-07-21T00:00:00.000Z', totals: { students: 4 } }, report, rows);
    expect(html).toContain('A &quot;quoted&quot; &lt;name&gt;');
    expect(html).toContain('Ready &amp; waiting');
    expect(html).toContain('<p class="card-value">4</p>');
  });
});
