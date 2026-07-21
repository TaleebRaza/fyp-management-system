import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProjectReviewDialog } from '../components/dashboards/supervisor/ProjectReviewDialog';

describe('Supervisor project review dialog', () => {
  it('keeps review and migration controls for a selected submitted project', () => {
    const html = renderToStaticMarkup(<ProjectReviewDialog project={{ _id: 'project-1', triggerStudentId: 'student-1', members: [{ _id: 'student-1', name: 'Ada', rollNo: '22-CS-1' }], projectTitle: 'Portal', pdfUrl: 'proposals/ada.pdf', status: 'Pending' }} currentUserId="supervisor-1" theme={{}} isDarkMode={false} isProcessing={false} migrationStudentId="student-1" migrationCode="" onClose={() => undefined} onStatusChange={() => undefined} onMigrationStudentChange={() => undefined} onMigrationCodeChange={() => undefined} onMigrate={() => undefined} onRemove={() => undefined} />);
    expect(html).toContain('Approve');
    expect(html).toContain('Migrate Student');
    expect(html).toContain('View PDF');
  });
});
