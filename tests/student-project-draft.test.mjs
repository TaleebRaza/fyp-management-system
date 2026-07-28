import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const draftModule = await importTypeScriptModule(
  'components/student/draft/studentProjectDraft.ts'
);

const {
  createStudentProjectDraft,
  getStudentProjectDraftKey,
  getStudentProjectFileDraftKey,
  hasStudentProjectDraftChanges,
} = draftModule;

test('student project draft keys remain backward compatible', () => {
  assert.equal(
    getStudentProjectDraftKey('student-123'),
    'fyp-portal:student-project-draft:v1:student-123'
  );
  assert.equal(
    getStudentProjectFileDraftKey('student-123'),
    'fyp-portal:student-project-draft:v1:student-123:pdf'
  );
});

test('draft creation keeps legacy domain only without normalized domains', () => {
  assert.deepEqual(
    createStudentProjectDraft({
      title: 'Project',
      desc: 'Description',
      domains: ['AI', 'WEB'],
      legacyDomain: 'Legacy',
      tools: 'React',
    }),
    {
      title: 'Project',
      desc: 'Description',
      selectedDomains: ['AI', 'WEB'],
      legacyDomain: '',
      tools: 'React',
    }
  );

  assert.equal(
    createStudentProjectDraft({ domains: [], legacyDomain: 'Machine Learning' })
      .legacyDomain,
    'Machine Learning'
  );
});

test('draft change detection compares the complete persisted draft', () => {
  const baseline = createStudentProjectDraft({ title: 'A', domains: ['AI'] });
  assert.equal(hasStudentProjectDraftChanges(baseline, baseline), false);
  assert.equal(
    hasStudentProjectDraftChanges({ ...baseline, tools: 'Python' }, baseline),
    true
  );
  assert.equal(hasStudentProjectDraftChanges(baseline, null), true);
});
