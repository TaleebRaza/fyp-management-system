import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const ratings = await importTypeScriptModule('config/projectRatings.ts');
const [formSource, dialogSource, displaySource, studentOverviewSource, exportFormSource] = await Promise.all([
  readFile(new URL('../components/project-ratings/ApprovalRatingForm.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/supervisor/SupervisorProjectDialog.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/project-ratings/ProjectRatingsDisplay.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../components/student/StudentOverviewSection.tsx', import.meta.url), 'utf8'),
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
  assert.match(formSource, /review version \{version\}/);
});

test('approval is disabled until ratings are complete and while submission is running', () => {
  assert.match(dialogSource, /disabled=\{!completeRatings \|\| isProcessingAction\}/);
  assert.match(dialogSource, /Approve and save ratings/);
  assert.match(dialogSource, /getProjectRatingRound\(project\.stage\)/);
  assert.match(dialogSource, /type="submit"/);
});

test('rating visibility hides future rounds and identifies passed rounds', () => {
  assert.deepEqual(ratings.getCompletedProjectRatingRounds('PROPOSAL'), []);
  assert.deepEqual(ratings.getCompletedProjectRatingRounds('THESIS_DRAFT'), ['proposal']);
  assert.deepEqual(ratings.getCompletedProjectRatingRounds('FINAL_DELIVERABLES'), ['proposal', 'thesis']);
  assert.match(displaySource, /Not rated \(legacy approval\)/);
});

test('supervisor and student views reuse the same rating display', () => {
  assert.match(dialogSource, /<ProjectRatingsDisplay/);
  assert.match(studentOverviewSource, /<ProjectRatingsDisplay/);
});

test('admin reports expose the rating round, three bounded minimums, and Excel action', () => {
  assert.match(exportFormSource, /<details/);
  assert.match(exportFormSource, /<summary/);
  assert.doesNotMatch(exportFormSource, /<details[^>]*\sopen/);
  assert.match(exportFormSource, /Project Ratings Export/);
  assert.match(exportFormSource, /option value="proposal"/);
  assert.match(exportFormSource, /option value="thesis"/);
  assert.match(exportFormSource, /PROJECT_RATING_CATEGORIES\.map/);
  assert.match(exportFormSource, /min=\{0\}/);
  assert.match(exportFormSource, /max=\{10\}/);
  assert.match(exportFormSource, /Download Excel/);
});
