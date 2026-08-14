import type { RegistrationPolicyDto } from '../types/registrationPolicy';

export const PROJECT_SUBMISSIONS_CLOSED_CODE = 'PROJECT_SUBMISSIONS_CLOSED';
export const PROJECT_SUBMISSIONS_CLOSED_MESSAGE =
  'Project submissions are currently closed by the administrator.';
export const PROJECT_COMPLETE_CODE = 'PROJECT_COMPLETE';
export const PROJECT_COMPLETE_MESSAGE =
  'Project submissions are closed because the final deliverables have been approved.';
export const PROJECT_SUBMISSION_PENDING_REVIEW_MESSAGE =
  'This project is awaiting review. You can submit again after the supervisor or administrator reviews it.';

export function areProjectSubmissionsOpen(
  policy: Pick<RegistrationPolicyDto, 'projectSubmissionsOpen'> | null | undefined
) {
  return policy?.projectSubmissionsOpen !== false;
}

export function hasPreviousProjectSubmission(
  project: { version?: unknown } | null | undefined
): boolean {
  const version = Number(project?.version ?? 0);
  return Number.isFinite(version) && version > 0;
}

export function isProjectSubmissionPendingReview(
  project: { status?: unknown } | null | undefined
): boolean {
  return project?.status === 'Submitted For Review';
}

export function isProjectComplete(
  project: { stage?: unknown; status?: unknown } | null | undefined
): boolean {
  return project?.stage === 'FINAL_DELIVERABLES' && project.status === 'Approved';
}
