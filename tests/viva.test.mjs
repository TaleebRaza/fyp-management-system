import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const viva = await importTypeScriptModule('lib/viva.ts');

test('validates viable Viva round configuration without factor scoring', () => {
  assert.deepEqual(
    viva.validateVivaConfiguration({
      targetPanelSize: 3,
      minimumPanelSize: 2,
      vivaDurationMinutes: 30,
    }),
    {
      success: true,
      configuration: {
        targetPanelSize: 3,
        minimumPanelSize: 2,
        vivaDurationMinutes: 30,
      },
    }
  );
});

test('rejects invalid panel sizes and Viva durations', () => {
  assert.deepEqual(
    viva.validateVivaConfiguration({
      targetPanelSize: 2,
      minimumPanelSize: 3,
      vivaDurationMinutes: 0,
    }),
    {
      success: false,
      errors: ['invalid-panel-sizes', 'invalid-viva-duration'],
    }
  );
  assert.deepEqual(viva.validateVivaConfiguration({}), {
    success: false,
    errors: [
      'invalid-target-panel-size',
      'invalid-minimum-panel-size',
      'invalid-viva-duration',
    ],
  });
});

test('derives session phases and gives terminal states precedence', () => {
  assert.deepEqual(viva.VIVA_PHASES, ['scheduled', 'running', 'completed', 'cancelled']);
  assert.equal(
    viva.calculateVivaPhase({ startedAt: null, completedAt: null, cancelledAt: null }),
    'scheduled'
  );
  assert.equal(
    viva.calculateVivaPhase({ startedAt: new Date('2026-09-15T09:00:00.000Z'), completedAt: null, cancelledAt: null }),
    'running'
  );
  assert.equal(
    viva.calculateVivaPhase({ startedAt: null, completedAt: new Date('2026-09-15T09:30:00.000Z'), cancelledAt: null }),
    'completed'
  );
  assert.equal(
    viva.calculateVivaPhase({ startedAt: null, completedAt: new Date(), cancelledAt: new Date() }),
    'cancelled'
  );
  assert.equal(viva.isVivaTerminalPhase('completed'), true);
  assert.equal(viva.isVivaTerminalPhase('cancelled'), true);
  assert.equal(viva.isVivaTerminalPhase('running'), false);
});

test('uses one canonical grade scale and rejects tampered labels', () => {
  assert.deepEqual(viva.VIVA_GRADE_SCALE, [
    { grade: 'A+', percentage: 100 },
    { grade: 'A', percentage: 90 },
    { grade: 'B', percentage: 80 },
    { grade: 'C', percentage: 70 },
    { grade: 'D', percentage: 60 },
    { grade: 'F', percentage: 0 },
  ]);

  for (const result of viva.VIVA_GRADE_SCALE) {
    assert.equal(viva.isVivaGrade(result.grade), true);
    assert.deepEqual(viva.getVivaGradeResult(result.grade), result);
  }

  assert.equal(viva.isVivaGrade('A-'), false);
  assert.equal(viva.getVivaGradeResult('A-'), null);
  assert.equal(viva.getVivaGradeResult(100), null);
});

test('allows grade selection only while running and freezes completed results', () => {
  assert.deepEqual(
    viva.getVivaGradeChangePermission('running', 'B'),
    { permitted: true, result: { grade: 'B', percentage: 80 } }
  );
  assert.deepEqual(
    viva.getVivaGradeChangePermission('running', 'A-'),
    { permitted: false, reason: 'invalid-grade' }
  );
  assert.deepEqual(
    viva.getVivaGradeChangePermission('scheduled', 'A'),
    { permitted: false, reason: 'outside-grading-period' }
  );
  assert.deepEqual(
    viva.getVivaGradeChangePermission('completed', 'A'),
    { permitted: false, reason: 'result-finalized' }
  );
});

test('requires one panel admin who is a unique panel member', () => {
  assert.equal(viva.isVivaPanelAdmin(['teacher-1', 'teacher-2'], 'teacher-1'), true);
  assert.equal(viva.isVivaPanelAdmin(['teacher-1', 'teacher-1'], 'teacher-1'), false);
  assert.equal(viva.isVivaPanelAdmin(['teacher-1', 'teacher-2'], 'teacher-3'), false);
  assert.equal(viva.isVivaPanelAdmin([], 'teacher-1'), false);
});
