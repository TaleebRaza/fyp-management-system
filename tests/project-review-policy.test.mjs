import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const {
  REVIEWED_PROJECT_STATUSES,
  isProjectAwaitingReview,
  isProjectReviewStatus,
} = await importTypeScriptModule('lib/projectReviewPolicy.ts');

test('project review statuses remain restricted to final supervisor decisions', () => {
  assert.deepEqual(REVIEWED_PROJECT_STATUSES, [
    'Approved',
    'Rejected',
    'Changes Requested',
  ]);

  for (const status of REVIEWED_PROJECT_STATUSES) {
    assert.equal(isProjectReviewStatus(status), true);
    assert.equal(isProjectReviewStatus(` ${status} `), true);
  }

  for (const status of ['', 'Pending', 'Submitted', 'approved', null, undefined]) {
    assert.equal(isProjectReviewStatus(status), false);
  }
});

test('only submitted projects without a final decision wait for review', () => {
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'https://files.test/proposal.pdf', status: 'Pending' }), true);
  assert.equal(isProjectAwaitingReview({ pdfUrl: ' proposal.pdf ', status: '' }), true);

  assert.equal(isProjectAwaitingReview({ pdfUrl: '', status: 'Pending' }), false);
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'proposal.pdf', status: 'Approved' }), false);
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'proposal.pdf', status: 'Rejected' }), false);
  assert.equal(isProjectAwaitingReview({ pdfUrl: 'proposal.pdf', status: 'Changes Requested' }), false);
});
