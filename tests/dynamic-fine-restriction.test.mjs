import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const restriction = await importTypeScriptModule('lib/fineRestrictionEngine.ts');

const context = {
  studentId: 'student-1',
  program: 'BSCS',
  batch: 'Fall 2026',
  projectId: 'project-1',
};

const fine = {
  id: 'fine-1',
  studentId: 'student-1',
  fineTypeId: 'type-1',
  policyId: 'policy-1',
  projectId: 'project-1',
  policyRestrictions: ['pdf-upload-student'],
};

test('uses fine record, student, fine type, and global precedence in that order', () => {
  const rules = [
    { id: 'global', scope: 'global', label: 'Global', restrictions: ['login-payment-only'] },
    { id: 'type', scope: 'fine-type', fineTypeId: 'type-1', label: 'Fine Type', restrictions: ['pdf-upload-team'] },
    { id: 'student', scope: 'student', studentId: 'student-1', label: 'Student', restrictions: ['supervisor-selection'] },
    { id: 'record', scope: 'fine-record', fineRecordId: 'fine-1', label: 'Fine Record', restrictions: ['login-complete'] },
  ];
  const result = restriction.resolveFineRestrictions([fine], rules, context);
  assert.deepEqual(result.restrictions, ['login-complete']);
  assert.equal(result.sources[0].scope, 'fine-record');
  assert.equal(result.sources[0].sourceLabel, 'Fine Record');
  assert.equal(result.loginMode, 'complete-lock');
});

test('fine record override wins and can explicitly impose no operational restriction', () => {
  const result = restriction.resolveFineRestrictions(
    [{ ...fine, restrictionOverrideEnabled: true, restrictionOverride: ['none'] }],
    [{ id: 'global', scope: 'global', label: 'Global', restrictions: ['login-complete'] }],
    context
  );
  assert.deepEqual(result.restrictions, ['none']);
  assert.equal(result.loginMode, 'none');
  assert.equal(result.blocksPdfUpload, false);
  assert.equal(result.sources[0].sourceLabel, 'Fine Record override');
});

test('combines contributions from multiple unresolved fines and retains their origins', () => {
  const result = restriction.resolveFineRestrictions(
    [
      fine,
      {
        ...fine,
        id: 'fine-2',
        fineTypeId: 'type-2',
        policyId: 'policy-2',
        policyRestrictions: ['login-payment-only'],
      },
    ],
    [],
    context
  );
  assert.deepEqual(result.restrictions, ['pdf-upload-student', 'login-payment-only']);
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sources.map((source) => source.fineId), ['fine-1', 'fine-2']);
  assert.equal(result.blocksPdfUpload, true);
  assert.equal(result.loginMode, 'payment-only');
});

test('project and program rules fit between student and fine-type precedence', () => {
  const result = restriction.resolveFineRestrictions(
    [fine],
    [
      { id: 'type', scope: 'fine-type', fineTypeId: 'type-1', label: 'Type', restrictions: ['pdf-upload-student'] },
      { id: 'program', scope: 'program-batch', program: 'BSCS', batch: 'Fall 2026', label: 'Program', restrictions: ['login-payment-only'] },
      { id: 'project', scope: 'project-team', projectId: 'project-1', label: 'Project', restrictions: ['pdf-upload-team'] },
    ],
    context
  );
  assert.deepEqual(result.restrictions, ['pdf-upload-team']);
  assert.equal(result.sources[0].scope, 'project-team');
});
