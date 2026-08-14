import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const policy = await importTypeScriptModule('lib/projectSubmissionPolicy.ts');
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('project submissions stay open for legacy policies and close only when explicitly disabled', () => {
  assert.equal(policy.areProjectSubmissionsOpen(), true);
  assert.equal(policy.areProjectSubmissionsOpen({}), true);
  assert.equal(policy.areProjectSubmissionsOpen({ projectSubmissionsOpen: true }), true);
  assert.equal(policy.areProjectSubmissionsOpen({ projectSubmissionsOpen: false }), false);
});

test('only approved final deliverables mark a project complete', () => {
  assert.equal(policy.isProjectComplete({ stage: 'FINAL_DELIVERABLES', status: 'Approved' }), true);
  assert.equal(policy.isProjectComplete({ stage: 'THESIS_DRAFT', status: 'Approved' }), false);
  assert.equal(policy.isProjectComplete({ stage: 'PROPOSAL', status: 'Approved' }), false);
  assert.equal(policy.isProjectComplete({ stage: 'FINAL_DELIVERABLES', status: 'Pending' }), false);
  assert.equal(policy.isProjectComplete(), false);
});

test('submitted projects remain locked until a review decision is recorded', () => {
  assert.equal(policy.isProjectSubmissionPendingReview({ status: 'Submitted For Review' }), true);
  assert.equal(policy.isProjectSubmissionPendingReview({ status: 'Pending' }), false);
  assert.equal(policy.isProjectSubmissionPendingReview({ status: 'Rejected' }), false);
  assert.equal(policy.isProjectSubmissionPendingReview(), false);
});

test('upload signing and project submission both enforce project completion', async () => {
  const [uploadRoute, studentRoute] = await Promise.all([
    read('app/api/upload/route.ts'),
    read('app/api/dashboard/student/route.ts'),
  ]);

  assert.match(uploadRoute, /if \(isProjectComplete\(project\)\)/);
  assert.match(studentRoute, /if \(isProjectComplete\(project\)\)/);
  assert.match(uploadRoute, /if \(isProjectSubmissionPendingReview\(project\)\)/);
  assert.match(studentRoute, /if \(isProjectSubmissionPendingReview\(project\)\)/);
  assert.match(uploadRoute, /PROJECT_COMPLETE_CODE/);
  assert.match(studentRoute, /PROJECT_COMPLETE_MESSAGE/);
});
