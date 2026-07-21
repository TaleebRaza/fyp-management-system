// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectSubmissionPanel } from '../components/dashboards/student/ProjectSubmissionPanel';

describe('ProjectSubmissionPanel', () => {
  it('keeps a closed submission form disabled while retaining the secure PDF link', () => {
    render(
      <ProjectSubmissionPanel
        canSubmit={false}
        projectStatus="Approved"
        pdfHref="/api/read-pdf?url=proposal.pdf"
        title="Portal"
        description="Description"
        selectedDomains={['artificial-intelligence']}
        legacyDomain=""
        tools="Next.js"
        file={null}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onTitleChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onDomainsChange={vi.fn()}
        onToolsChange={vi.fn()}
        onFileChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /submit for review/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('link', { name: /view pdf/i }).getAttribute('href')).toBe('/api/read-pdf?url=proposal.pdf');
  });
});
