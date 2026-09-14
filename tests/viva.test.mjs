import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const viva = await importTypeScriptModule('lib/viva.ts');

const factors = [
  { id: 'presentation', label: 'Presentation' },
  { id: 'technical', label: 'Technical knowledge' },
];

test('validates and normalizes viable Viva round configuration', () => {
  const configuration = viva.validateVivaConfiguration({
    factors: [
      { id: ' presentation ', label: ' Presentation ' },
      { id: 'technical', label: 'Technical knowledge' },
    ],
    targetPanelSize: 3,
    minimumPanelSize: 2,
    vivaDurationMinutes: 30,
    extraGradingDurationMinutes: 10,
  });

  assert.deepEqual(configuration, {
    success: true,
    configuration: {
      factors,
      targetPanelSize: 3,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
      extraGradingDurationMinutes: 10,
    },
  });
});

test('rejects invalid panels, durations, and factors', () => {
  const configuration = viva.validateVivaConfiguration({
    factors: [{ id: 'presentation', label: '' }, { id: 'presentation', label: 'Duplicate' }],
    targetPanelSize: 2,
    minimumPanelSize: 3,
    vivaDurationMinutes: 0,
    extraGradingDurationMinutes: -1,
  });

  assert.deepEqual(configuration, {
    success: false,
    errors: [
      'invalid-panel-sizes',
      'invalid-viva-duration',
      'invalid-extra-grading-duration',
      'invalid-factor',
    ],
  });
  assert.deepEqual(viva.validateVivaConfiguration({}), {
    success: false,
    errors: [
      'invalid-target-panel-size',
      'invalid-minimum-panel-size',
      'invalid-viva-duration',
      'invalid-extra-grading-duration',
      'factors-required',
    ],
  });
});

test('derives the lifecycle at exact deadline boundaries and keeps publication separate', () => {
  const timeline = {
    startedAt: new Date('2026-09-14T09:00:00.000Z'),
    vivaEndsAt: new Date('2026-09-14T09:30:00.000Z'),
    extraGradingEndsAt: new Date('2026-09-14T09:40:00.000Z'),
    cancelledAt: null,
  };

  assert.deepEqual(viva.VIVA_PHASES, ['scheduled', 'running', 'extra_grading', 'ended', 'cancelled']);
  assert.equal(viva.calculateVivaPhase({ ...timeline, startedAt: null }, timeline.vivaEndsAt), 'scheduled');
  assert.equal(viva.calculateVivaPhase(timeline, new Date('2026-09-14T09:29:59.999Z')), 'running');
  assert.equal(viva.calculateVivaPhase(timeline, timeline.vivaEndsAt), 'extra_grading');
  assert.equal(viva.calculateVivaPhase(timeline, timeline.extraGradingEndsAt), 'ended');
  assert.equal(
    viva.calculateVivaPhase({ ...timeline, cancelledAt: new Date('2026-09-14T09:31:00.000Z') }, timeline.vivaEndsAt),
    'cancelled'
  );
  assert.equal(viva.isVivaPublished({ publishedAt: null }), false);
  assert.equal(viva.isVivaPublished({ publishedAt: new Date('2026-09-14T10:00:00.000Z') }), true);
});

test('allows revisions during Viva time and only missing scores during extra grading', () => {
  const existingScore = { value: 8, source: 'examiner' };

  assert.deepEqual(
    viva.getVivaScoreChangePermission('running', existingScore, 9),
    { permitted: true }
  );
  assert.deepEqual(
    viva.getVivaScoreChangePermission('extra_grading', undefined, 7),
    { permitted: true }
  );
  assert.deepEqual(
    viva.getVivaScoreChangePermission('extra_grading', existingScore, 9),
    { permitted: false, reason: 'score-locked' }
  );
  assert.deepEqual(
    viva.getVivaScoreChangePermission('ended', undefined, 7),
    { permitted: false, reason: 'outside-grading-period' }
  );
  assert.deepEqual(
    viva.getVivaScoreChangePermission('running', undefined, 0),
    { permitted: false, reason: 'invalid-score' }
  );
});

test('keeps missing marks distinct until finalization, then averages all examiners and factors equally', () => {
  const firstSheet = {
    presentation: { value: 7, source: 'examiner' },
    technical: { value: 9, source: 'examiner' },
  };
  const secondSheet = {
    presentation: { value: 10, source: 'examiner' },
  };

  assert.equal(viva.calculateVivaAverages(factors, [firstSheet, secondSheet]), null);

  const finalizedSecondSheet = viva.fillMissingVivaScores(factors, secondSheet);
  assert.deepEqual(finalizedSecondSheet, {
    presentation: { value: 10, source: 'examiner' },
    technical: { value: 0, source: 'deadline' },
  });
  assert.deepEqual(secondSheet, {
    presentation: { value: 10, source: 'examiner' },
  });
  assert.deepEqual(viva.calculateVivaAverages(factors, [firstSheet, finalizedSecondSheet]), {
    overall: 6.5,
    factors: { presentation: 8.5, technical: 4.5 },
  });
  assert.equal(viva.roundVivaAverage(5 / 3), 1.67);
});
