export const REVIEWED_PROJECT_STATUSES = [
  'Approved',
  'Rejected',
  'Changes Requested',
] as const;

export type ProjectReviewStatus = (typeof REVIEWED_PROJECT_STATUSES)[number];

const REVIEWED_STATUS_SET = new Set<string>(REVIEWED_PROJECT_STATUSES);

export function isProjectReviewStatus(value: unknown): value is ProjectReviewStatus {
  return REVIEWED_STATUS_SET.has(String(value || '').trim());
}

export function isProjectAwaitingReview(project: { pdfUrl?: unknown; status?: unknown }) {
  return Boolean(String(project.pdfUrl || '').trim()) && !isProjectReviewStatus(project.status);
}
