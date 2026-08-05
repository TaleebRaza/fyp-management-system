import type { ProjectReviewStatus } from './projectReviewPolicy';
import type { UserRole } from './security/auth';

export const PORTAL_ACTIVITY_LOG_ID = 'recent-portal-activity';
export const PORTAL_ACTIVITY_LOG_LIMIT = 100;
export const PORTAL_ACTIVITY_PAGE_SIZE = 15;

export const PORTAL_ACTIVITY_ACTIONS = [
  'login',
  'logout',
  'password-changed',
  'student-registered',
  'project-submitted',
  'project-approved',
  'project-rejected',
  'project-changes-requested',
  'student-name-updated',
  'student-academic-details-updated',
  'student-supervisor-updated',
  'student-team-joined',
  'student-team-left',
  'supervisor-student-migrated',
  'supervisor-team-removed',
  'supervisor-team-expanded',
  'supervisor-broadcast-published',
  'supervisor-broadcast-cleared',
  'admin-supervisor-added',
  'admin-supervisor-deleted',
  'admin-supervisor-updated',
  'admin-student-updated',
  'admin-registration-updated',
  'admin-fines-updated',
  'admin-headline-updated',
  'admin-project-submissions-updated',
] as const;

export type PortalActivityAction = (typeof PORTAL_ACTIVITY_ACTIONS)[number];

export type PortalActivityEntry = {
  action: PortalActivityAction;
  actorId: string;
  actorRole: UserRole;
  actorName?: string;
  actorRollNo?: string;
  occurredAt: Date;
};

export type PortalActivityInput = Pick<
  PortalActivityEntry,
  'action' | 'actorId' | 'actorRole' | 'actorName' | 'actorRollNo'
>;

export function isPortalActivityActorRole(value: unknown): value is UserRole {
  return value === 'admin' || value === 'supervisor' || value === 'student';
}

export function projectReviewActivityAction(status: ProjectReviewStatus): PortalActivityAction {
  if (status === 'Approved') return 'project-approved';
  return status === 'Rejected' ? 'project-rejected' : 'project-changes-requested';
}

export function createPortalActivityUpdate(input: PortalActivityInput) {
  return {
    $push: {
      entries: {
        // ponytail: one 100-entry document is enough here; split the feed only if real write contention appears.
        $each: [{ ...input, occurredAt: new Date() }],
        $position: 0,
        $slice: PORTAL_ACTIVITY_LOG_LIMIT,
      },
    },
  };
}
