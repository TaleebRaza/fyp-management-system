import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const ratings = await importTypeScriptModule('config/projectRatings.ts');

test('rating categories use stable keys and shared display labels', () => {
  assert.deepEqual(ratings.PROJECT_RATING_CATEGORIES, [
    { key: 'projectIdea', label: 'Project Idea' },
    { key: 'technicalMerit', label: 'Technical Merit' },
    { key: 'documentationQuality', label: 'Documentation Quality' },
  ]);
  assert.deepEqual(ratings.PROJECT_RATING_VALUES, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('rating validation accepts exactly three integer scores from 1 through 10', () => {
  const valid = {
    projectIdea: 1,
    technicalMerit: 10,
    documentationQuality: 6,
  };

  assert.deepEqual(ratings.parseProjectRatingValues(valid), valid);

  for (const invalid of [
    undefined,
    { ...valid, projectIdea: 0 },
    { ...valid, technicalMerit: 11 },
    { ...valid, documentationQuality: 7.5 },
    { ...valid, projectIdea: '8' },
    { projectIdea: 8, technicalMerit: 7 },
    { ...valid, extra: 5 },
  ]) {
    assert.equal(ratings.parseProjectRatingValues(invalid), null);
  }
});

test('project stages map only approval rounds that require ratings', () => {
  assert.equal(ratings.getProjectRatingRound('PROPOSAL'), 'proposal');
  assert.equal(ratings.getProjectRatingRound('THESIS_DRAFT'), 'thesis');
  assert.equal(ratings.getProjectRatingRound('FINAL_DELIVERABLES'), null);
  assert.equal(ratings.getProjectRatingRound('proposal'), null);
});

test('safe dashboard ratings omit reviewer ids and invalid snapshots', () => {
  const ratedAt = new Date('2026-08-06T10:00:00.000Z');
  assert.deepEqual(
    ratings.getSafeProjectRatings({
      proposal: {
        projectIdea: 8,
        technicalMerit: 7,
        documentationQuality: 9,
        ratedAt,
        ratedBy: 'private-user-id',
      },
      thesis: {
        projectIdea: 0,
        technicalMerit: 7,
        documentationQuality: 9,
        ratedAt,
      },
    }),
    {
      proposal: {
        projectIdea: 8,
        technicalMerit: 7,
        documentationQuality: 9,
        ratedAt,
      },
    }
  );
});
