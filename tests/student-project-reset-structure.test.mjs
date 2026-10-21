import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('project reset keeps the team and supervisor while clearing document workflow state', async () => {
  const [route, dashboard, overview, teamSection, teamActions] = await Promise.all([
    read('app/api/dashboard/student/route.ts'),
    read('components/dashboards/StudentDashboard.tsx'),
    read('components/student/StudentOverviewSection.tsx'),
    read('components/student/StudentTeamSection.tsx'),
    read('components/student/hooks/useStudentTeamActions.ts'),
  ]);
  const actionStart = route.indexOf("if (action === 'resetProject')");
  const actionEnd = route.indexOf('// ACTION: CHANGE SUPERVISOR', actionStart);
  const resetAction = route.slice(actionStart, actionEnd);

  assert.ok(actionStart >= 0);
  assert.match(resetAction, /withStorageTransaction/);
  assert.match(resetAction, /reason: 'student-project-reset'/);
  assert.match(resetAction, /project\.stage = 'PROPOSAL'/);
  assert.match(resetAction, /project\.status = 'Pending'/);
  assert.match(resetAction, /project\.pdfUrl = ''/);
  assert.match(resetAction, /project\.ratings = undefined/);
  assert.doesNotMatch(resetAction, /deleteOne|\$pull|releaseSupervisorProjectSlot|VoiceNote/);
  assert.doesNotMatch(route, /resetProposal/);
  assert.match(dashboard, /onResetProject=\{handleResetProject\}/);
  assert.match(overview, /onResetProject/);
  assert.match(overview, /Reset Project/i);
  assert.doesNotMatch(teamSection, /Reset project/i);
  assert.doesNotMatch(teamSection, /Change proposal/i);
  assert.match(teamActions, /team, supervisor, project details, messages, and voice notes will be kept/i);
});

test('post-proposal submissions keep project details locked and require a new PDF', async () => {
  const [route, dashboard, submissionSection] = await Promise.all([
    read('app/api/dashboard/student/route.ts'),
    read('components/dashboards/StudentDashboard.tsx'),
    read('components/student/StudentProjectSubmissionSection.tsx'),
  ]);

  assert.match(route, /const canEditProjectDetails = project\.stage === 'PROPOSAL'/);
  assert.match(route, /\.\.\.\(canEditProjectDetails\s*\? \{[\s\S]*title,[\s\S]*description,[\s\S]*domains: selectedDomainIds,[\s\S]*tools,/);
  assert.match(route, /!canEditProjectDetails && oldPdfKey === uploadedObject\.key/);
  assert.match(dashboard, /useStudentDashboardNavigation\(Boolean\(fineRestriction\)/);
  assert.match(submissionSection, /disabled=\{!canSubmit \|\| !canEditProjectDetails\}/);
  assert.match(submissionSection, /type="file"[\s\S]*disabled=\{!canSubmit\}/);
});

test('closing submissions disables reset and gates its transaction before project changes', async () => {
  const [route, dashboard, overview] = await Promise.all([
    read('app/api/dashboard/student/route.ts'),
    read('components/dashboards/StudentDashboard.tsx'),
    read('components/student/StudentOverviewSection.tsx'),
  ]);
  const resetAction = route.slice(
    route.indexOf("if (action === 'resetProject')"),
    route.indexOf('// ACTION: CHANGE SUPERVISOR')
  );
  assert.match(dashboard, /projectSubmissionsOpen=\{data\?\.projectSubmissionsOpen !== false\}/);
  assert.match(overview, /disabled=\{isSubmitting \|\| !projectSubmissionsOpen\}/);
  assert.match(resetAction, /await getOrCreateRegistrationPolicy\(\)/);
  assert.match(resetAction, /RegistrationPolicy\.updateOne\([\s\S]*projectSubmissionsOpen: \{ \$ne: false \}[\s\S]*\$inc: \{ version: 1 \}[\s\S]*\{ session \}/);
  assert.match(resetAction, /if \(resetPolicy\.matchedCount !== 1\) \{\s*throw new StorageProtocolError\(PROJECT_SUBMISSIONS_CLOSED_MESSAGE, 403\)/);
  assert.ok(resetAction.indexOf('resetPolicy.matchedCount') < resetAction.indexOf('Project.findOne'));
});
