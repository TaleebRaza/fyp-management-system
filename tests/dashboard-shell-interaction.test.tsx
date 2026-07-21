// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DashboardShell } from '../components/ui/SharedUI';

describe('DashboardShell mobile menu', () => {
  it('closes with Escape and restores the document scroll setting', async () => {
    const user = userEvent.setup();
    document.body.style.overflow = 'auto';
    render(<DashboardShell title="Student" navItems={[{ id: 'overview', label: 'Overview' }]}>Content</DashboardShell>);

    await user.click(screen.getByRole('button', { name: 'Open dashboard menu' }));
    expect(screen.getByLabelText('Mobile dashboard navigation')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Mobile dashboard navigation')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });
});
