import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile(new URL('../lib/projectReview.ts', import.meta.url), 'utf8');
const reviewStart = service.indexOf('export async function reviewProject');
const progressionStart = service.indexOf('export async function progressProjectStage');
const review = service.slice(reviewStart, progressionStart);
const progression = service.slice(progressionStart);

test('document review changes status without moving stage or deleting the approved PDF', () => {
  assert.match(review, /status: 'Submitted For Review'/);
  assert.match(review, /\$set: \{ status, reviewRemarks: remarks \}/);
  assert.doesNotMatch(review, /newStage|pdfUrl: ''|enqueueStorageDeletion/);
  assert.match(review, /version: expectedVersion/);
});

test('stage progression requires an approved current PDF and optimistic version', () => {
  assert.match(progression, /isProjectProgressable\(project\)/);
  assert.match(progression, /project\.stage !== expectedStage/);
  assert.match(progression, /Number\(project\.version \|\| 0\) !== expectedVersion/);
  assert.match(progression, /status: 'Document Approved'/);
  assert.match(progression, /pdfUrl: \{ \$type: 'string', \$ne: '' \}/);
  assert.doesNotMatch(progression, /pdfUrl: ''|enqueueStorageDeletion/);
});

test('progression saves stage ratings and distinguishes forward movement from completion', () => {
  assert.match(progression, /validateProjectProgressionRatings/);
  assert.match(progression, /ratings\.\$\{ratingValidation\.ratingRound\}/);
  assert.match(progression, /getProjectProgressionState\(expectedStage\)/);
  assert.match(progression, /result: \{ success: true, completed, newStage \}/);
});
