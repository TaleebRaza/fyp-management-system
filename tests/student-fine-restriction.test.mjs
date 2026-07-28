import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const fine = await importTypeScriptModule(
  'components/student/workflows/studentFineRestriction.ts'
);

test('uses the current student fine when no team override exists', () => {
  const result = fine.getStudentFineRestrictionState({
    fineRestriction: { active: true, isCurrentStudent: true },
  });
  assert.equal(result.isOwnFineRestricted, true);
  assert.equal(result.isFineRestricted, true);
  assert.match(result.teamFineMessage, /your outstanding fine/);
});

test('identifies and names a restricted teammate', () => {
  const result = fine.getStudentFineRestrictionState({
    fineRestriction: null,
    teamFineRestriction: {
      active: true,
      isCurrentStudent: false,
      member: { name: 'Student Two', rollNo: 'FA22-BCS-002' },
    },
  });
  assert.equal(result.isOwnFineRestricted, false);
  assert.equal(result.isFineRestricted, true);
  assert.match(result.teamFineMessage, /Student Two \(FA22-BCS-002\)/);
});

test('returns an unrestricted state when no active fine exists', () => {
  const result = fine.getStudentFineRestrictionState(null);
  assert.equal(result.fineRestriction, null);
  assert.equal(result.teamFineRestriction, null);
  assert.equal(result.isOwnFineRestricted, false);
  assert.equal(result.isFineRestricted, false);
});
