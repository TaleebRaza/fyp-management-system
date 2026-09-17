import mongoose from 'mongoose';

import VivaSession from '../models/VivaSession';

export const VIVA_ACTIVE_SESSION_ACCESS_ERROR =
  'You cannot access the portal while your assigned Viva session is active.';

// Backward-compatible export for callers compiled against the previous name.
export const VIVA_PANEL_MEMBER_ACCESS_ERROR = VIVA_ACTIVE_SESSION_ACCESS_ERROR;

export async function isVivaSessionAccessRestricted(userId: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(userId)) return false;

  return Boolean(await VivaSession.exists({
    startedAt: { $ne: null },
    completedAt: null,
    cancelledAt: null,
    $or: [
      { 'projectSnapshot.members.userId': userId },
      {
        'panelSnapshot.examiners.userId': userId,
        'panelSnapshot.panelAdmin.userId': { $exists: true, $ne: userId },
      },
    ],
  }));
}

// Retained for older callers; access restrictions now also cover active-team students.
export const isVivaPanelMemberAccessRestricted = isVivaSessionAccessRestricted;
