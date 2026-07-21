import { describe, expect, it } from 'vitest';

import { buildProjectStatusEmail, buildProjectSubmissionEmail } from '../lib/dashboardEmailTemplates';

describe('dashboard email templates', () => {
  it('keeps the project-submission subject and submitted details', () => {
    const email = buildProjectSubmissionEmail({
      studentName: 'Ayesha Khan',
      domainText: 'Artificial Intelligence',
      title: 'Study Buddy',
    });

    expect(email.subject).toBe('New FYP Project Submitted: Ayesha Khan');
    expect(email.html).toContain('<strong>Domains:</strong> Artificial Intelligence');
    expect(email.html).toContain('<strong>Title:</strong> Study Buddy');
  });

  it('keeps the stage-advance subject, status color, and default remarks', () => {
    const email = buildProjectStatusEmail({
      supervisorName: 'Dr Khan',
      status: 'Approved',
      notificationMessage: 'Proposal Approved!',
      remarks: '',
      stageAdvanced: true,
    });

    expect(email.subject).toBe('FYP Project Update: Stage Advanced!');
    expect(email.html).toContain('color: #10b981');
    expect(email.html).toContain('Proceed to the next stage.');
  });
});
