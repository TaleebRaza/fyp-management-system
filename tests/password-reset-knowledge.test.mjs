import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { matchesPasswordResetKnowledge } = await importTypeScriptModule(
  'lib/security/passwordResetKnowledge.ts'
);

const stored = {
  rollNo: 'F23-0201',
  supervisorId: 'supervisor-1',
  batch: 'Fall 2023',
  program: 'BSCS',
  teammateRollNos: ['F23-0202'],
  requiresTeammate: true,
};

const provided = {
  rollNo: 'F23-0201',
  supervisorId: 'supervisor-1',
  batch: 'Fall 2023',
  program: 'BSCS',
  teammateRollNo: 'F23-0202',
};

test('password reset knowledge requires every stored identity factor', () => {
  assert.equal(matchesPasswordResetKnowledge(stored, provided), true);

  for (const [field, value] of [
    ['rollNo', 'F23-9999'],
    ['supervisorId', 'supervisor-2'],
    ['batch', 'Spring 2023'],
    ['program', 'BSAI'],
    ['teammateRollNo', 'F23-9999'],
  ]) {
    assert.equal(matchesPasswordResetKnowledge(stored, { ...provided, [field]: value }), false);
  }
});

test('teammate roll number is optional only when the student has no teammate', () => {
  assert.equal(
    matchesPasswordResetKnowledge(
      { ...stored, teammateRollNos: [], requiresTeammate: false },
      { ...provided, teammateRollNo: '' }
    ),
    true
  );
  assert.equal(matchesPasswordResetKnowledge(stored, { ...provided, teammateRollNo: '' }), false);
});
