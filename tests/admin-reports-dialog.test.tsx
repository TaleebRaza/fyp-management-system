import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { REPORT_OPTIONS } from '../lib/adminReports';
import { ReportsDialog } from '../components/dashboards/admin/ReportsDialog';

describe('Admin reports dialog', () => {
  it('renders the selected report and disabled exports when no rows exist', () => {
    const html = renderToStaticMarkup(
      <ReportsDialog
        open
        onClose={() => undefined}
        isLoading={false}
        hasReports
        totals={{ students: 3 }}
        generatedAt="2026-07-21T00:00:00.000Z"
        reportOptions={REPORT_OPTIONS}
        selectedReport={REPORT_OPTIONS[0]}
        rows={[]}
        onSelectReport={() => undefined}
        onLoad={() => undefined}
        onDownloadCsv={() => undefined}
        onDownloadHtml={() => undefined}
        onOpenReport={() => undefined}
      />
    );

    expect(html).toContain('Students per Supervisor');
    expect(html).toContain('No data available for this report');
    expect(html).toContain('disabled');
  });
});
