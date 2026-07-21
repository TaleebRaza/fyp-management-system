// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProjectDomainSelector } from '../components/dashboards/student/ProjectDomainSelector';

describe('ProjectDomainSelector keyboard interaction', () => {
  it('opens with the keyboard and selects a catalogue domain', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ProjectDomainSelector selectedDomains={[]} onChange={onChange} />);

    await user.tab();
    await user.keyboard(' ');

    expect(screen.getByRole('button', { name: /choose project domains/i }).getAttribute('aria-expanded')).toBe('true');
    await user.click(screen.getByRole('checkbox', { name: /artificial intelligence/i }));
    expect(onChange).toHaveBeenCalledWith(['artificial-intelligence']);
  });
});
