import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('student name updates are rate-limited without resetting academic data', async () => {
  const routeSource = await readFile(
    new URL('../app/api/dashboard/student/route.ts', import.meta.url),
    'utf8'
  );
  const actionStart = routeSource.indexOf("if (action === 'updateName')");
  const actionEnd = routeSource.indexOf('// ACTION: STUDENT PROGRAM/BATCH SELF UPDATE', actionStart);
  const nameUpdateAction = routeSource.slice(actionStart, actionEnd);

  assert.match(routeSource, /NAME_CHANGE_COOLDOWN_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(nameUpdateAction, /lastNameChangeAt: \{ \$lte: nameChangeCutoff \}/);
  assert.match(nameUpdateAction, /\$set: \{ name: normalizedName, lastNameChangeAt: now \}/);
  assert.doesNotMatch(nameUpdateAction, /resetStudentAcademicInfo/);
});
