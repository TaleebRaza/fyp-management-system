import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectCountDocuments: vi.fn(),
  userCountDocuments: vi.fn(),
}));

vi.mock('../models/User', () => ({
  default: { countDocuments: mocks.userCountDocuments },
}));
vi.mock('../models/Project', () => ({
  default: { countDocuments: mocks.projectCountDocuments },
}));

import { APP_SETTINGS } from '../config/appSettings';
import { getSupervisorFilledSlots } from '../lib/supervisorCapacity';

function countQuery(count: number) {
  return {
    session: vi.fn().mockResolvedValue(count),
    then: (resolve: (value: number) => unknown) => Promise.resolve(count).then(resolve),
  };
}

describe('getSupervisorFilledSlots', () => {
  const originalMode = APP_SETTINGS.SLOT_CALCULATION_MODE;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    APP_SETTINGS.SLOT_CALCULATION_MODE = originalMode;
  });

  it('counts assigned students in STUDENT mode using the active transaction session', async () => {
    APP_SETTINGS.SLOT_CALCULATION_MODE = 'STUDENT';
    const query = countQuery(4);
    const session = {} as never;
    mocks.userCountDocuments.mockReturnValue(query);

    await expect(getSupervisorFilledSlots('supervisor-1', session)).resolves.toBe(4);
    expect(mocks.userCountDocuments).toHaveBeenCalledWith({
      role: 'student',
      supervisorId: 'supervisor-1',
    });
    expect(query.session).toHaveBeenCalledWith(session);
    expect(mocks.projectCountDocuments).not.toHaveBeenCalled();
  });

  it('counts projects in PROJECT mode without adding a transaction session', async () => {
    APP_SETTINGS.SLOT_CALCULATION_MODE = 'PROJECT';
    const query = countQuery(2);
    mocks.projectCountDocuments.mockReturnValue(query);

    await expect(getSupervisorFilledSlots('supervisor-1')).resolves.toBe(2);
    expect(mocks.projectCountDocuments).toHaveBeenCalledWith({ supervisorId: 'supervisor-1' });
    expect(query.session).not.toHaveBeenCalled();
    expect(mocks.userCountDocuments).not.toHaveBeenCalled();
  });
});
