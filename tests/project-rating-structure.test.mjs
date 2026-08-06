import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [service, supervisorRoute, adminRoute, model] = await Promise.all([
  readFile(new URL('../lib/projectReview.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/dashboard/supervisor/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/api/admin/project-reviews/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../models/Project.ts', import.meta.url), 'utf8'),
]);

test('review transaction guards stage, version, submitted status, and immutable snapshots', () => {
  assert.match(service, /withStorageTransaction/);
  assert.match(service, /stage: expectedStage/);
  assert.match(service, /status: 'Submitted For Review'/);
  assert.match(service, /version: expectedVersion/);
  assert.match(service, /ratings\.\$\{ratingValidation\.ratingRound\}/);
  assert.match(service, /ratedBy: approverId/);
  assert.match(service, /runValidators: true/);
});

test('both review endpoints send authenticated reviewer and optimistic concurrency fields', () => {
  for (const route of [supervisorRoute, adminRoute]) {
    assert.match(route, /expectedStage/);
    assert.match(route, /expectedVersion/);
    assert.match(route, /approverId: currentUser\.id/);
    assert.match(route, /ratings/);
  }
});

test('project embeds proposal and thesis rating snapshots without a new collection', () => {
  assert.match(model, /const RatingSnapshotSchema = new Schema/);
  assert.match(model, /proposal: \{ type: RatingSnapshotSchema/);
  assert.match(model, /thesis: \{ type: RatingSnapshotSchema/);
  assert.match(model, /ratedAt: \{ type: Date, required: true \}/);
  assert.match(model, /ratedBy: \{ type: mongoose\.Schema\.Types\.ObjectId/);
});
