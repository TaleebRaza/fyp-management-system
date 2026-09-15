import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const { allocateRandomVivaPanels, parseVivaPanelAllocationInput } = await importTypeScriptModuleWithDependencies('lib/vivaPanelAdmin.ts');

test('shuffles teachers into target-sized panels and randomly selects an in-panel admin', () => {
  const randomValues = [0, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999];
  let randomValueIndex = 0;
  const panels = allocateRandomVivaPanels(
    ['teacher-1', 'teacher-2', 'teacher-3', 'teacher-4', 'teacher-5'],
    3,
    () => randomValues[randomValueIndex++]
  );

  assert.deepEqual(panels, [
    {
      examinerIds: ['teacher-5', 'teacher-2', 'teacher-3'],
      panelAdminId: 'teacher-3',
    },
    {
      examinerIds: ['teacher-4', 'teacher-1'],
      panelAdminId: 'teacher-1',
    },
  ]);
});

test('rejects invalid random panel allocation input', () => {
  assert.equal(allocateRandomVivaPanels(['teacher-1', 'teacher-1'], 2), null);
  assert.equal(allocateRandomVivaPanels(['teacher-1'], 1), null);
  assert.equal(allocateRandomVivaPanels([], 2), null);
  assert.equal(parseVivaPanelAllocationInput({}).success, false);
  assert.equal(parseVivaPanelAllocationInput({
    roundId: '000000000000000000000001',
    panelRevision: 0,
  }).success, true);
});
