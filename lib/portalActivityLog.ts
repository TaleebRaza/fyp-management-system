import PortalActivityLog from '../models/PortalActivityLog';
import {
  createPortalActivityUpdate,
  PORTAL_ACTIVITY_LOG_ID,
  PORTAL_ACTIVITY_PAGE_SIZE,
  type PortalActivityAction,
  type PortalActivityEntry,
  type PortalActivityInput,
} from './portalActivityLogPolicy';
import type { CurrentUser } from './security/auth';

export * from './portalActivityLogPolicy';

type PortalActivityDocument = {
  entries?: PortalActivityEntry[];
};

export async function recordPortalActivity(input: PortalActivityInput) {
  try {
    await PortalActivityLog.updateOne(
      { _id: PORTAL_ACTIVITY_LOG_ID },
      createPortalActivityUpdate(input),
      { upsert: true }
    );
  } catch {
    console.error('portal_activity_log_write_failed');
  }
}

export async function recordCurrentUserActivity(
  action: PortalActivityAction,
  currentUser: CurrentUser
) {
  await recordPortalActivity({
    action,
    actorId: currentUser.id,
    actorRole: currentUser.role,
    actorName: currentUser.name,
    actorRollNo: currentUser.rollNo,
  });
}

export async function getPortalActivityPage(page: number) {
  const document = await PortalActivityLog.findById(PORTAL_ACTIVITY_LOG_ID)
    .select('entries')
    .lean<PortalActivityDocument>();
  const entries = Array.isArray(document?.entries) ? document.entries : [];
  const total = entries.length;
  const totalPages = Math.ceil(total / PORTAL_ACTIVITY_PAGE_SIZE);
  const boundedPage = Math.min(Math.max(page, 1), Math.max(totalPages, 1));
  const offset = (boundedPage - 1) * PORTAL_ACTIVITY_PAGE_SIZE;

  return {
    entries: entries.slice(offset, offset + PORTAL_ACTIVITY_PAGE_SIZE),
    pagination: {
      page: boundedPage,
      limit: PORTAL_ACTIVITY_PAGE_SIZE,
      total,
      totalPages,
    },
  };
}
