import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ExportProjectsButton } from '../components/dashboards/supervisor/ExportProjectsButton';

describe('Supervisor export button', () => {
  it('disables duplicate downloads while exporting', () => {
    const html = renderToStaticMarkup(<ExportProjectsButton isExporting label="Export Excel" onExport={() => undefined} />);
    expect(html).toContain('Exporting...');
    expect(html).toContain('disabled');
  });
});
