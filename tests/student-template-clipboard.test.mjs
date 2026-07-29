import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { createTemplateClipboardHtml } = await importTypeScriptModule(
  'components/student/utils/studentTemplateClipboard.ts'
);

test('template clipboard wrapper preserves the rich HTML body', () => {
  const html = '<h1>Proposal</h1><p>Content</p>';
  assert.equal(
    createTemplateClipboardHtml(html),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Proposal</h1><p>Content</p></body></html>'
  );
});
