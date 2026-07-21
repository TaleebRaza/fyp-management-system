// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TemplateResourcesPanel } from '../components/dashboards/student/TemplateResourcesPanel';

describe('TemplateResourcesPanel', () => {
  it('loads templates and opens the selected template', async () => {
    const user = userEvent.setup();
    const onLoad = vi.fn();
    const onOpen = vi.fn();
    const template = {
      id: 'proposal',
      title: 'Proposal template',
      filename: 'proposal.docx',
      format: 'word' as const,
      content: '<p>Proposal</p>',
    };

    render(<TemplateResourcesPanel stageLabel="Proposal" templates={[template]} isLoading={false} onLoad={onLoad} onOpen={onOpen} />);

    await user.click(screen.getByRole('button', { name: /load word templates/i }));
    await user.click(screen.getByRole('button', { name: /proposal template/i }));

    expect(onLoad).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledWith(template);
  });
});
