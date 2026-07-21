// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SupervisorActionsPanel } from '../components/dashboards/student/SupervisorActionsPanel';

describe('SupervisorActionsPanel', () => {
  it('keeps assignment and join controls available before a supervisor is assigned', async () => {
    const user = userEvent.setup();
    const onAssign = vi.fn((event) => event.preventDefault());
    const onJoin = vi.fn((event) => event.preventDefault());

    render(<SupervisorActionsPanel isUnassigned isSubmitting={false} isSupervisorChangeLocked={false} supervisorOptions={[{ id: 'supervisor-1', label: 'Dr Ada' }]} supervisorChangeOptions={[]} selectedSupervisorId="" inviteCodeInput="" onSupervisorChange={vi.fn()} onInviteCodeChange={vi.fn()} onAssign={onAssign} onJoin={onJoin} onOpenSupervisorChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /confirm assignment/i }));
    await user.click(screen.getByRole('button', { name: /join team/i }));

    expect(onAssign).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledOnce();
  });
});
