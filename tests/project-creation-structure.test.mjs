import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('project invite-code creation is centralized', async () => {
  const [projectCreation, ...callers] = await Promise.all([
    readFile(new URL('../lib/projectCreation.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/academicReset.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/dashboard/student/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/dashboard/supervisor/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/project/leave/route.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(projectCreation, /for \(let attempt = 0; attempt < 5; attempt\+\+\)/);
  assert.match(projectCreation, /createInviteCode/);

  for (const caller of callers) {
    assert.match(caller, /createProjectWithUniqueInviteCode/);
    assert.doesNotMatch(caller, /Failed to generate a unique project invite code/);
  }
});
