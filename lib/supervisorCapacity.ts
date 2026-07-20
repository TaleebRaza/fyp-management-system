import type { ClientSession, Types } from 'mongoose';

import { APP_SETTINGS } from '../config/appSettings';
import User from '../models/User';
import Project from '../models/Project';
import { getSupervisorMaxSlots } from './supervisorSlots';

type SupervisorForCapacity = {
  _id: Types.ObjectId;
  extraSlots?: unknown;
  name?: string;
};

type CapacityReservation =
  | { kind: 'available'; maxSlots: number; supervisor: SupervisorForCapacity }
  | { kind: 'full'; maxSlots: number }
  | { kind: 'missing' };

export async function getSupervisorFilledSlots(
  supervisorId: string,
  session?: ClientSession
) {
  if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'STUDENT') {
    const query = User.countDocuments({ role: 'student', supervisorId });
    return session ? query.session(session) : query;
  }

  if (APP_SETTINGS.SLOT_CALCULATION_MODE === 'PROJECT') {
    const query = Project.countDocuments({ supervisorId });
    return session ? query.session(session) : query;
  }

  return 0;
}

export async function reserveSupervisorCapacity(
  supervisorId: string,
  session: ClientSession
): Promise<CapacityReservation> {
  const supervisor = await User.findOne({ _id: supervisorId, role: 'supervisor' })
    .select('_id name extraSlots')
    .session(session);

  if (!supervisor) return { kind: 'missing' };

  const filledSlots = await getSupervisorFilledSlots(supervisorId, session);
  const maxSlots = getSupervisorMaxSlots(supervisor);

  if (filledSlots >= maxSlots) return { kind: 'full', maxSlots };

  const lock = await User.updateOne(
    { _id: supervisorId, role: 'supervisor' },
    { $inc: { capacityVersion: 1 } },
    { session }
  );

  if (lock.matchedCount !== 1) return { kind: 'missing' };

  return { kind: 'available', maxSlots, supervisor };
}
