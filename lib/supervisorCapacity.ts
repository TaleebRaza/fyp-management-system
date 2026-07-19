import type { ClientSession } from 'mongoose';

import { APP_SETTINGS } from '../config/appSettings';
import User from '../models/User';
import Project from '../models/Project';

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
