import mongoose from 'mongoose';

import VivaSession from '../models/VivaSession';

export const VIVA_PANEL_MEMBER_ACCESS_ERROR =
  'You cannot access the portal while your assigned Viva panel is active.';

export async function isVivaPanelMemberAccessRestricted(userId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return false;

  return Boolean(await VivaSession.exists({
    startedAt: { $ne: null },
    completedAt: null,
    cancelledAt: null,
    'panelSnapshot.examiners.userId': userId,
    'panelSnapshot.panelAdmin.userId': { $exists: true, $ne: userId },
  }));
}
