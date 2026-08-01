import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const policy = await importTypeScriptModule('lib/projectSubmissionPolicy.ts');

test('project submissions stay open for legacy policies and close only when explicitly disabled', () => {
  assert.equal(policy.areProjectSubmissionsOpen(), true);
  assert.equal(policy.areProjectSubmissionsOpen({}), true);
  assert.equal(policy.areProjectSubmissionsOpen({ projectSubmissionsOpen: true }), true);
  assert.equal(policy.areProjectSubmissionsOpen({ projectSubmissionsOpen: false }), false);
});
