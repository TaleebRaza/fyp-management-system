import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const { parseVivaScheduleInput, parseVivaScheduleUpdateInput } = await importTypeScriptModuleWithDependencies('lib/vivaScheduling.ts');

test('Viva scheduling is automatic-only', async () => {
  const component = await readFile(
    new URL('../components/admin/VivaScheduleManagement.tsx', import.meta.url),
    'utf8'
  );

  assert.match(component, /action: 'preview-automatic-schedule'/);
  assert.doesNotMatch(component, /schedule-session|reschedule-session|Manual Team Scheduling/);
  assert.match(component, /type="date"/);
  assert.match(component, /type="time"/);
  assert.doesNotMatch(component, /datetime-local/);
});

test('parses UTC Viva schedule input and rejects ambiguous timestamps', () => {
  const parsed = parseVivaScheduleInput({
    roundId: '507f191e810c19729de860ea',
    panelId: '507f191e810c19729de860eb',
    projectId: '507f191e810c19729de860ec',
    scheduledAt: '2026-10-10T09:00:00.000Z',
    locationLabel: ' Lab 3 ',
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.input.scheduledAt.toISOString(), '2026-10-10T09:00:00.000Z');
  assert.equal(parsed.success && parsed.input.locationLabel, 'Lab 3');
  assert.equal(
    parseVivaScheduleInput({
      roundId: '507f191e810c19729de860ea',
      panelId: '507f191e810c19729de860eb',
      projectId: '507f191e810c19729de860ec',
      scheduledAt: '2026-10-10T09:00:00',
    }).success,
    false
  );
  assert.equal(
    parseVivaScheduleUpdateInput({
      roundId: '507f191e810c19729de860ea',
      panelId: '507f191e810c19729de860eb',
      projectId: '507f191e810c19729de860ec',
      scheduledAt: '2026-10-10T09:00:00.000Z',
      sessionId: '507f191e810c19729de860ed',
      version: -1,
    }).success,
    false
  );
});
