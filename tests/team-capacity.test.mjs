import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const {
  DEFAULT_TEAM_SIZE,
  EXPANDED_TEAM_SIZE,
  getTeamCapacity,
} = await importTypeScriptModule('config/appSettings.ts');

test('team capacity defaults to two members', () => {
  assert.equal(DEFAULT_TEAM_SIZE, 2);
  assert.equal(getTeamCapacity(undefined), 2);
  assert.equal(getTeamCapacity(null), 2);
  assert.equal(getTeamCapacity(0), 2);
  assert.equal(getTeamCapacity(2), 2);
  assert.equal(getTeamCapacity(4), 2);
  assert.equal(getTeamCapacity('invalid'), 2);
});

test('only the explicit expanded value permits three members', () => {
  assert.equal(EXPANDED_TEAM_SIZE, 3);
  assert.equal(getTeamCapacity(3), 3);
  assert.equal(getTeamCapacity('3'), 3);
  assert.equal(getTeamCapacity(' 3 '), 3);
});
