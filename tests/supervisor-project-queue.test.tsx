import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProjectQueue } from '../components/dashboards/supervisor/ProjectQueue';

describe('Supervisor project queue', () => {
  it('marks a submitted project as waiting for review', () => {
    const html = renderToStaticMarkup(<ProjectQueue title="Review Queue" description="Waiting" queueFilter="review" projects={[{ _id: 'project-1', members: [{ name: 'Ada', rollNo: '22-CS-1', program: 'BSCS' }], pdfUrl: 'proposals/ada.pdf', projectTitle: 'Portal', status: 'Pending' }]} emptyState={{ title: 'Empty', description: 'None' }} search="" batchFilter="All" batches={[]} isExporting={false} onSearchChange={() => undefined} onBatchChange={() => undefined} onClearQueueFilter={() => undefined} onExport={() => undefined} onSelectProject={() => undefined} />);
    expect(html).toContain('Waiting for review');
    expect(html).toContain('PDF attached');
  });
});
