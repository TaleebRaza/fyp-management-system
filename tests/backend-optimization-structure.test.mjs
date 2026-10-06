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
  assert.match(scheduling, /projectQuery \?\? Project\.findOne\(\{ members: studentId \}\)/);
});

test('admin reports avoid first-stage facets and expression membership lookups', async () => {
  const source = await readSource('app/api/admin/reports/route.ts');
  assert.match(source, /\{ \$match: \{ role: 'student' \} \}[\s\S]*localField: '_id',[\s\S]*foreignField: 'members'/);
  assert.doesNotMatch(source, /\$expr:\s*\{\s*\$in:\s*\['\$\$studentId', '\$members'\]/);
  assert.match(source, /Project\.aggregate<ProjectReportRow>\(\[\s*\{\s*\$project:/);
});

test('dashboard auth projections remove duplicate user reads without weakening revocation', async () => {
  const [auth, studentRoute, supervisorRoute, studentFeature, supervisorFeature] = await Promise.all([
    readSource('lib/security/auth.ts'),
    readSource('app/api/dashboard/student/route.ts'),
    readSource('app/api/dashboard/supervisor/route.ts'),
    readSource('lib/features/student/dashboard.ts'),
    readSource('lib/features/supervisor/dashboard.ts'),
  ]);
  const studentGet = studentRoute.split('export async function POST')[0];
  const supervisorGet = supervisorRoute.split('export async function POST')[0];

  assert.match(auth, /query\.select\(extraProjection\)/);
  assert.match(auth, /Number\(token\.sessionVersion[\s\S]*Number\(sessionVersion/);
  assert.match(studentGet, /getStudentDashboard\(currentUser\)/);
  assert.doesNotMatch(studentGet, /User\.findOne/);
  assert.match(supervisorGet, /getSupervisorDashboard\(currentUser\)/);
  assert.doesNotMatch(supervisorGet, /User\.findById/);
  assert.match(studentFeature, /Project\.findOne\(\{ members: student\.id \}\)/);
  assert.match(supervisorFeature, /migrationCode: supervisor\.migrationCode/);
});
