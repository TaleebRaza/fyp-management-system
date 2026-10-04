import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('projects index supervisor ownership directly', async () => {
  const source = await readSource('models/Project.ts');
  assert.match(source, /ProjectSchema\.index\(\{ supervisorId: 1 \}\)/);
});

test('confirmed student schedules use snapshots with a legacy fallback', async () => {
  const [roundAdmin, scheduling] = await Promise.all([
    readSource('lib/vivaRoundAdmin.ts'),
    readSource('lib/vivaScheduling.ts'),
  ]);
  assert.match(roundAdmin, /snapshotConfirmedSessions\(round, scheduledSessions, session\)/);
  assert.match(scheduling, /'projectSnapshot\.members\.userId': studentId/);
  assert.match(scheduling, /const project = await Project\.findOne\(\{ members: studentId \}\)/);
});

test('admin reports avoid first-stage facets and expression membership lookups', async () => {
  const source = await readSource('app/api/admin/reports/route.ts');
  assert.match(source, /\{ \$match: \{ role: 'student' \} \}[\s\S]*localField: '_id',[\s\S]*foreignField: 'members'/);
  assert.doesNotMatch(source, /\$expr:\s*\{\s*\$in:\s*\['\$\$studentId', '\$members'\]/);
  assert.match(source, /Project\.aggregate<ProjectReportRow>\(\[\s*\{\s*\$project:/);
});
