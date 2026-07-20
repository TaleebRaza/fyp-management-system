import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectCountDocuments: vi.fn(),
  userCountDocuments: vi.fn(),
  userFindOne: vi.fn(),
  userUpdateOne: vi.fn(),
}));

vi.mock('../models/User', () => ({
  default: {
    countDocuments: mocks.userCountDocuments,
    findOne: mocks.userFindOne,
    updateOne: mocks.userUpdateOne,
  },
}));
vi.mock('../models/Project', () => ({
  default: { countDocuments: mocks.projectCountDocuments },
}));

import { APP_SETTINGS } from '../config/appSettings';
import { getSupervisorFilledSlots, reserveSupervisorCapacity } from '../lib/supervisorCapacity';
import { withTransactionRetry } from '../lib/transactionUtils';

function countQuery(count: number) {
  return {
    session: vi.fn().mockResolvedValue(count),
    then: (resolve: (value: number) => unknown) => Promise.resolve(count).then(resolve),
  };
}

function supervisorQuery(supervisor: { _id: { toString: () => string }; extraSlots?: number; name?: string } | null) {
  return {
    select: () => ({ session: vi.fn().mockResolvedValue(supervisor) }),
  };
}

function transactionSession() {
  return {
    abortTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    endSession: vi.fn(),
    inTransaction: vi.fn().mockReturnValue(true),
    startTransaction: vi.fn(),
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

  it('locks the supervisor document after passing the capacity check', async () => {
    APP_SETTINGS.SLOT_CALCULATION_MODE = 'STUDENT';
    const session = {} as never;
    const supervisor = { _id: { toString: () => 'supervisor-1' }, extraSlots: 1, name: 'Dr Ada' };
    mocks.userFindOne.mockReturnValue(supervisorQuery(supervisor));
    mocks.userCountDocuments.mockReturnValue(countQuery(30));
    mocks.userUpdateOne.mockResolvedValue({ matchedCount: 1 });

    await expect(reserveSupervisorCapacity('supervisor-1', session)).resolves.toEqual({
      kind: 'available',
      maxSlots: 31,
      supervisor,
    });
    expect(mocks.userUpdateOne).toHaveBeenCalledWith(
      { _id: 'supervisor-1', role: 'supervisor' },
      { $inc: { capacityVersion: 1 } },
      { session }
    );
  });

  it('retries a capacity-lock conflict and rechecks the boundary before allowing a write', async () => {
    APP_SETTINGS.SLOT_CALCULATION_MODE = 'STUDENT';
    const session = transactionSession();
    const supervisor = { _id: { toString: () => 'supervisor-1' }, extraSlots: 0 };
    mocks.userFindOne.mockReturnValue(supervisorQuery(supervisor));
    mocks.userCountDocuments
      .mockReturnValueOnce(countQuery(29))
      .mockReturnValueOnce(countQuery(30));
    mocks.userUpdateOne
      .mockRejectedValueOnce({ code: 112, hasErrorLabel: () => true });

    await expect(
      withTransactionRetry(session as never, () => reserveSupervisorCapacity('supervisor-1', session as never))
    ).resolves.toEqual({ kind: 'full', maxSlots: 30 });
    expect(session.startTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.userUpdateOne).toHaveBeenCalledTimes(1);
  });

  it('rechecks project-mode capacity after a concurrent reservation conflict', async () => {
    APP_SETTINGS.SLOT_CALCULATION_MODE = 'PROJECT';
    const session = transactionSession();
    const supervisor = { _id: { toString: () => 'supervisor-1' }, extraSlots: 0 };
    mocks.userFindOne.mockReturnValue(supervisorQuery(supervisor));
    mocks.projectCountDocuments
      .mockReturnValueOnce(countQuery(29))
      .mockReturnValueOnce(countQuery(30));
    mocks.userUpdateOne
      .mockRejectedValueOnce({ code: 112, hasErrorLabel: () => true });

    await expect(
      withTransactionRetry(session as never, () => reserveSupervisorCapacity('supervisor-1', session as never))
    ).resolves.toEqual({ kind: 'full', maxSlots: 30 });
    expect(session.startTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.userUpdateOne).toHaveBeenCalledTimes(1);
  });
});
