import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const ratings = await importTypeScriptModule('config/projectRatings.ts');
const [formSource, dialogSource, displaySource, studentSubmissionSource, exportFormSource] = await Promise.all([
  readFile(new URL('../components/project-ratings/ApprovalRatingForm.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/supervisor/SupervisorProjectDialog.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/project-ratings/ProjectRatingsDisplay.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/student/StudentProjectSubmissionSection.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/admin/reports/ProjectRatingsExportForm.tsx', import.meta.url), 'utf8'),
]);

test('approval form uses required native radios for every shared category and 1-10 value', () => {
  assert.equal(ratings.PROJECT_RATING_CATEGORIES.length, 3);
  assert.equal(ratings.PROJECT_RATING_VALUES.length, 10);
  assert.match(formSource, /PROJECT_RATING_CATEGORIES\.map/);
  assert.match(formSource, /PROJECT_RATING_VALUES\.map/);
  assert.match(formSource, /type="radio"/);
  assert.match(formSource, /required/);
  assert.match(formSource, /aria-label=\{`\$\{label\}: \$\{value\} out of 10`\}/);
  assert.match(formSource, /peer-focus-visible:ring-2/);
  assert.match(formSource, /review version \$\{version\}/);
});

test('approval is disabled until ratings are complete and while submission is running', () => {
  assert.match(dialogSource, /disabled=\{!completeRatings \|\| isProcessingAction\}/);
  assert.match(dialogSource, /Save ratings and progress/);
  assert.match(dialogSource, /getProjectRatingRound\(project\.stage\)/);
  assert.match(dialogSource, /type="submit"/);
});

test('progression rating state is scoped to the selected project', () => {
  assert.match(dialogSource, /const isRatingFormOpen = projectId !== null && ratingProjectId === projectId/);
  assert.match(dialogSource, /setRatingProjectId\(project\._id\)/);
});

test('rating visibility hides future rounds and identifies passed rounds', () => {
  assert.deepEqual(ratings.getCompletedProjectRatingRounds('PROPOSAL'), []);
  assert.deepEqual(ratings.getCompletedProjectRatingRounds('THESIS_DRAFT'), ['proposal']);
  assert.deepEqual(ratings.getCompletedProjectRatingRounds('FINAL_DELIVERABLES'), ['proposal', 'thesis']);
  assert.match(displaySource, /Not rated \(legacy approval\)/);
});

test('supervisor and student views reuse the same rating display', () => {
  assert.match(dialogSource, /<ProjectRatingsDisplay/);
  assert.match(studentSubmissionSource, /<ProjectRatingsDisplay/);
});

test('saved ratings can be reviewed and updated without mutating project stage metadata', () => {
  assert.match(dialogSource, /Review rating/);
  assert.match(dialogSource, /Update rating/);
  assert.match(dialogSource, /ProjectRatingsDisplay[\s\S]*onReviewRating/);
  assert.match(dialogSource, /reviewRatingRound/);
  assert.match(dialogSource, /window\.open\(/);
});

test('admin reports expose the rating round, three bounded minimums, and PDF action', () => {
  assert.match(exportFormSource, /<details/);
  assert.match(exportFormSource, /<summary/);
  assert.doesNotMatch(exportFormSource, /<details[^>]*\sopen/);
  assert.match(exportFormSource, /Project Ratings Export/);
  assert.match(exportFormSource, /option value="proposal"/);
  assert.match(exportFormSource, /option value="thesis"/);
  assert.match(exportFormSource, /PROJECT_RATING_CATEGORIES\.map/);
  assert.match(exportFormSource, /min=\{0\}/);
  assert.match(exportFormSource, /max=\{10\}/);
  assert.match(exportFormSource, /Download PDF/);
});
