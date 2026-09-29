import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('supervisor project cards and dialog expose the progressive-disclosure workspace', async () => {
  const cardSource = await readFile(
    new URL('../components/supervisor/SupervisorProjectCard.tsx', import.meta.url),
    'utf8'
  );
  const dialogSource = await readFile(
    new URL('../components/supervisor/SupervisorProjectDialog.tsx', import.meta.url),
    'utf8'
  );

  assert.match(cardSource, /Project title/i);
  assert.match(cardSource, /program/i);
  assert.doesNotMatch(cardSource, /Waiting for review/);

  assert.match(dialogSource, /type ProjectDialogView/i);
  assert.match(dialogSource, /Actions/i);
  assert.match(dialogSource, /Details/i);
  assert.match(dialogSource, /Team/i);
  assert.match(dialogSource, /management.*Team|Team.*management/i);
  assert.match(dialogSource, /Approve/i);
  assert.match(dialogSource, /Request Changes/i);
  assert.match(dialogSource, /Reject/i);
  assert.match(dialogSource, /View PDF/i);
  assert.match(dialogSource, /Migrate Student/i);
  assert.match(dialogSource, /Allow 3 Members/i);
  assert.match(dialogSource, /Remove Team/i);
});
