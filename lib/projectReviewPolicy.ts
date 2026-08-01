export const REVIEWED_PROJECT_STATUSES = [
  'Approved',
  'Rejected',
  'Changes Requested',
] as const;

export const APPROVED_PROJECT_STAGES = ['THESIS_DRAFT', 'FINAL_DELIVERABLES'] as const;

export type ProjectReviewStatus = (typeof REVIEWED_PROJECT_STATUSES)[number];

const REVIEWED_STATUS_SET = new Set<string>(REVIEWED_PROJECT_STATUSES);
const APPROVED_STAGE_SET = new Set<string>(APPROVED_PROJECT_STAGES);

export function isProjectReviewStatus(value: unknown): value is ProjectReviewStatus {
  return REVIEWED_STATUS_SET.has(String(value || '').trim());
}

export function isProjectAwaitingReview(project: { pdfUrl?: unknown; status?: unknown }) {
  return Boolean(String(project.pdfUrl || '').trim()) && !isProjectReviewStatus(project.status);
}

export function isProjectApproved(project: { status?: unknown; stage?: unknown }) {
  return project.status === 'Approved' || APPROVED_STAGE_SET.has(String(project.stage || '').trim());
}
