import type { ClientSession } from 'mongoose';
import VivaSession from '../models/VivaSession';

export const GRADED_PROJECT_LOCK_MESSAGE =
  'Your Viva grade has been saved. Only document uploads are allowed until an administrator resets your project.';

export async function isProjectGraded(projectId: unknown, session?: ClientSession): Promise<boolean> {
  if (!projectId) return false;
  return Boolean(await VivaSession.exists({
    projectId,
    cancelledAt: null,
    'result.selectedAt': { $type: 'date' },
  }).session(session || null));
}
