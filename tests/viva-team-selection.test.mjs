import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { selectTeamsByProgramQuota } = await importTypeScriptModule('lib/vivaTeamSelection.ts');

const teams = [
  { id: 'cs-1', program: 'BSCS' },
  { id: 'cs-2', program: 'BSCS' },
  { id: 'ai-1', program: 'BSAI' },
  { id: 'unknown', program: '' },
];

test('selects exact random program quotas and ignores zero or unknown quotas', () => {
  const result = selectTeamsByProgramQuota(teams, { BSCS: 1, BSAI: 1, BSSE: 0 }, () => 0);
  assert.deepEqual(result.selectedIds.sort(), ['ai-1', 'cs-2']);
  assert.deepEqual(result.shortages, []);
  assert.equal(result.selectedIds.includes('unknown'), false);
});

test('selects every available team and reports quota shortages', () => {
  const result = selectTeamsByProgramQuota(teams, { BSCS: 4, BSSE: 2 }, () => 0.5);
  assert.deepEqual(new Set(result.selectedIds), new Set(['cs-1', 'cs-2']));
  assert.deepEqual(result.shortages, [
    { program: 'BSCS', requested: 4, selected: 2, missing: 2 },
    { program: 'BSSE', requested: 2, selected: 0, missing: 2 },
  ]);
});
