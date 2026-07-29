import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(
  new URL('../components/dashboards/StudentDashboard.tsx', import.meta.url),
  'utf8'
);

const draftHook = await readFile(
  new URL('../components/student/hooks/useStudentProjectDraft.ts', import.meta.url),
  'utf8'
);
const templateHook = await readFile(
  new URL('../components/student/hooks/useStudentTemplates.ts', import.meta.url),
  'utf8'
);

test('student dashboard delegates draft and template workflows', () => {
  assert.match(dashboard, /useStudentProjectDraft\(currentUserId\)/);
  assert.match(dashboard, /useStudentTemplates\(\{/);
  assert.match(dashboard, /await restoreProjectDraft\(serverProjectDraft\)/);
  assert.match(dashboard, /await resetProjectDraft\(\)/);
  assert.match(dashboard, /resetTemplates\(\)/);
  assert.doesNotMatch(dashboard, /readBrowserDraft|writeBrowserDraft/);
  assert.doesNotMatch(dashboard, /new DOMParser|document\.execCommand\('copy'\)/);
});

test('draft persistence remains debounced and file persistence remains isolated', () => {
  assert.match(draftHook, /DRAFT_SAVE_DELAY_MS = 300/);
  assert.match(draftHook, /writeBrowserDraft\(draftKey, currentDraft\)/);
  assert.match(draftHook, /writeBrowserFileDraft\(fileDraftKey, nextFile\)/);
  assert.match(draftHook, /clearBrowserFileDraft\(fileDraftKey\)/);
});

test('template hook owns stage caching and clipboard state', () => {
  assert.match(templateHook, /cachedTemplateStage === currentStage/);
  assert.match(templateHook, /getStudentTemplates\(requestedStage\)/);
  assert.match(templateHook, /copyTemplateHtml\(html\)/);
  assert.match(templateHook, /setIsCopied\(true\)/);
});
