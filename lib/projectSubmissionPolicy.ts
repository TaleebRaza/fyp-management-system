import type { RegistrationPolicyDto } from '../types/registrationPolicy';

export const PROJECT_SUBMISSIONS_CLOSED_CODE = 'PROJECT_SUBMISSIONS_CLOSED';
export const PROJECT_SUBMISSIONS_CLOSED_MESSAGE =
  'Project submissions are currently closed by the administrator.';

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
