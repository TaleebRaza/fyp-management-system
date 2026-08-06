import type { ClientSession } from 'mongoose';

import { APP_SETTINGS } from '../config/appSettings';
import User from '../models/User';

type CapacityReservation = 'reserved' | 'full' | 'uninitialized' | 'missing';

const NUMERIC_COUNTER = { $type: 'number' };

export async function reserveSupervisorProjectSlot(
  supervisorId: unknown,
  session: ClientSession
): Promise<CapacityReservation> {
  const result = await User.updateOne(
    {
      _id: supervisorId,
      role: 'supervisor',
      occupiedSlots: NUMERIC_COUNTER,
      $expr: {
        $lt: [
          '$occupiedSlots',
          { $add: [APP_SETTINGS.MAX_SLOTS_PER_SUPERVISOR, { $ifNull: ['$extraSlots', 0] }] },
        ],
      },
    },
    { $inc: { occupiedSlots: 1 } },
    { session, runValidators: true }
  );
  if (result.modifiedCount === 1) return 'reserved';

  const supervisor = await User.exists({ _id: supervisorId, role: 'supervisor' }).session(session);
  if (!supervisor) return 'missing';

  const initialized = await User.exists({
    _id: supervisorId,
    role: 'supervisor',
    occupiedSlots: NUMERIC_COUNTER,
  }).session(session);
  return initialized ? 'full' : 'uninitialized';
}

export async function releaseSupervisorProjectSlot(
  supervisorId: unknown,
  session: ClientSession
) {
  const result = await User.updateOne(
    {
      _id: supervisorId,
      role: 'supervisor',
      occupiedSlots: NUMERIC_COUNTER,
      $expr: { $gt: ['$occupiedSlots', 0] },
    },
    { $inc: { occupiedSlots: -1 } },
    { session, runValidators: true }
  );

  return result.modifiedCount === 1;
}

export function capacityReservationError(reservation: Exclude<CapacityReservation, 'reserved'>) {
  if (reservation === 'uninitialized') {
    return 'Supervisor capacity is being reconciled. Please try again shortly.';
  }
  if (reservation === 'missing') return 'Selected supervisor was not found.';
  return 'The selected supervisor has reached maximum project capacity.';
}
