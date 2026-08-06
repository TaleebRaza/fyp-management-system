import {
  getProjectRatingRound,
  parseProjectRatingValues,
  type ProjectRatingRound,
  type ProjectRatingValues,
} from '../config/projectRatings';

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
  return Boolean(String(project.pdfUrl || '').trim()) && project.status === 'Submitted For Review';
}

export function isProjectApproved(project: { status?: unknown; stage?: unknown }) {
  return project.status === 'Approved' || APPROVED_STAGE_SET.has(String(project.stage || '').trim());
}

type ReviewRatingValidation =
  | {
      success: true;
      ratingRound: null;
      ratings: null;
    }
  | {
      success: true;
      ratingRound: ProjectRatingRound;
      ratings: ProjectRatingValues;
    }
  | {
      success: false;
      reason: 'ratings-required' | 'ratings-not-allowed';
    };

export function validateProjectReviewRatings({
  status,
  stage,
  ratings,
}: {
  status: ProjectReviewStatus;
  stage: unknown;
  ratings?: unknown;
}): ReviewRatingValidation {
  const ratingRound = getProjectRatingRound(stage);

  if (status !== 'Approved' || !ratingRound) {
    return ratings === undefined
      ? { success: true, ratingRound: null, ratings: null }
      : { success: false, reason: 'ratings-not-allowed' };
  }

  const parsedRatings = parseProjectRatingValues(ratings);
  return parsedRatings
    ? { success: true, ratingRound, ratings: parsedRatings }
    : { success: false, reason: 'ratings-required' };
}
