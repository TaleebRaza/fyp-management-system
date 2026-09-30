import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const {
  APPROVED_PROJECT_STAGES,
  isProjectApproved,
  REVIEWED_PROJECT_STATUSES,
  isProjectAwaitingReview,
  isProjectReviewStatus,
  isProjectProgressable,
  getProjectProgressionState,
  validateProjectProgressionRatings,
} = await importTypeScriptModule('lib/projectReviewPolicy.ts');

test('project review statuses remain restricted to final supervisor decisions', () => {
  assert.deepEqual(REVIEWED_PROJECT_STATUSES, [
    'Document Approved',
    'Changes Requested',
  ]);

  for (const status of REVIEWED_PROJECT_STATUSES) {
    assert.equal(isProjectReviewStatus(status), true);
    assert.equal(isProjectReviewStatus(` ${status} `), true);
  }

  for (const status of ['', 'Pending', 'Submitted', 'Approved', 'Rejected', 'approved', null, undefined]) {
    assert.equal(isProjectReviewStatus(status), false);
  }
});

test('only submitted projects without a final decision wait for review', () => {
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'https://files.test/proposal.pdf', status: 'Submitted For Review' }), true);

  assert.equal(isProjectAwaitingReview({ pdfUrl: 'proposal.pdf', status: 'Pending' }), false);
  assert.equal(isProjectAwaitingReview({ pdfUrl: '', status: 'Pending' }), false);
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'proposal.pdf', status: 'Approved' }), false);
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'proposal.pdf', status: 'Rejected' }), false);
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'proposal.pdf', status: 'Changes Requested' }), false);
});

test('only an approved current document can progress and every stage moves forward', () => {
  assert.equal(isProjectProgressable({ pdfUrl: 'proposal.pdf', status: 'Document Approved' }), true);
  assert.equal(isProjectProgressable({ pdfUrl: 'proposal.pdf', status: 'Submitted For Review' }), false);
  assert.equal(isProjectProgressable({ pdfUrl: '', status: 'Document Approved' }), false);

  assert.deepEqual(getProjectProgressionState('PROPOSAL'), {
    newStage: 'THESIS_DRAFT', status: 'Pending', completed: false,
  });
  assert.deepEqual(getProjectProgressionState('THESIS_DRAFT'), {
    newStage: 'FINAL_DELIVERABLES', status: 'Pending', completed: false,
  });
  assert.deepEqual(getProjectProgressionState('FINAL_DELIVERABLES'), {
    newStage: undefined, status: 'Approved', completed: true,
  });
  assert.equal(getProjectProgressionState('UNKNOWN'), null);
});

test('progression rating rules require scores only for proposal and thesis stages', () => {
  const ratings = {
    projectIdea: 8,
    technicalMerit: 7,
    documentationQuality: 9,
  };

  assert.deepEqual(
    validateProjectProgressionRatings({ stage: 'PROPOSAL', ratings }),
    { success: true, ratingRound: 'proposal', ratings }
  );
  assert.deepEqual(
    validateProjectProgressionRatings({ stage: 'THESIS_DRAFT', ratings }),
    { success: true, ratingRound: 'thesis', ratings }
  );
  assert.deepEqual(
    validateProjectProgressionRatings({ stage: 'PROPOSAL' }),
    { success: false, reason: 'ratings-required' }
  );
  assert.deepEqual(
    validateProjectProgressionRatings({ stage: 'FINAL_DELIVERABLES' }),
    { success: true, ratingRound: null, ratings: null }
  );
  assert.deepEqual(
    validateProjectProgressionRatings({ stage: 'FINAL_DELIVERABLES', ratings }),
    { success: false, reason: 'ratings-not-allowed' }
  );
});

test('projects count as approved after advancing beyond the proposal stage', () => {
  assert.deepEqual(APPROVED_PROJECT_STAGES, ['THESIS_DRAFT', 'FINAL_DELIVERABLES']);
  assert.equal(isProjectApproved({ status: 'Pending', stage: 'PROPOSAL' }), false);
  assert.equal(isProjectApproved({ status: 'Pending', stage: 'THESIS_DRAFT' }), true);
  assert.equal(isProjectApproved({ status: 'Pending', stage: 'FINAL_DELIVERABLES' }), true);
  assert.equal(isProjectApproved({ status: 'Approved', stage: 'PROPOSAL' }), true);
  assert.equal(isProjectApproved({ status: 'Document Approved', stage: 'PROPOSAL' }), true);
});
