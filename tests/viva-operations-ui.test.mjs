import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin Viva UI exposes program requirements and accessible panel swapping', async () => {
  const [roundSetup, schedule] = await Promise.all([
    read('components/admin/AdminVivaSection.tsx'),
    read('components/admin/VivaScheduleManagement.tsx'),
  ]);

  assert.match(roundSetup, /Filter teams by program/);
  assert.match(roundSetup, /Random team requirements/);
  assert.match(roundSetup, /Apply requirements/);
  assert.match(roundSetup, /missing \{shortage\.missing\}/);
  assert.match(schedule, /draggable=\{busy === null\}/);
  assert.match(schedule, /action: 'swap-session-panels'/);
  assert.match(schedule, /Swap here/);
});

test('supervisor Viva UI confirms requeueing and does not offer it after a saved grade', async () => {
  const workspace = await read('components/supervisor/VivaSessionWorkspace.tsx');

  assert.match(workspace, /action: 'requeue-session'/);
  assert.match(workspace, /Cancel start and move last/);
  assert.match(workspace, /!session\.result/);
  assert.match(workspace, /Confirm requeue/);
});
