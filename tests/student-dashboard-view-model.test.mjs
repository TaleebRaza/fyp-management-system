import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const selectors = await importTypeScriptModule(
  'components/student/selectors/studentDashboardViewModel.ts'
);

test('builds student permissions, team capacity, and secure PDF URL', () => {
  const result = selectors.buildStudentDashboardViewModel(
    {
      student: {
        name: 'Student One',
        program: 'BSAI',
        status: 'Pending',
        tools: 'React, FastAPI',
        supervisorId: 'sup-1',
        pdfUrl: 'https://files.example.com/projects/demo.pdf',
      },
      project: {
        status: 'Pending',
        stage: 'PROPOSAL',
        inviteCode: 'ABC123',
        maxTeamSize: 3,
        members: [{ _id: 'student-1', name: 'Student One' }],
      },
    },
    '',
    ''
  );

  assert.equal(result.canSubmitByStatus, true);
  assert.equal(result.canSubmit, true);
  assert.equal(result.canShareInviteCode, true);
  assert.equal(result.canLeaveTeam, false);
  assert.equal(result.maxTeamSize, 3);
  assert.deepEqual(result.toolsList, ['React', 'FastAPI']);
  assert.equal(
    selectors.getStudentSecureMediaUrl(result.pdfUrl),
    '/api/read-pdf?url=projects%2Fdemo.pdf'
  );
});

test('combines admin and supervisor announcements without changing labels', () => {
  const items = selectors.getStudentAnnouncementItems(
    {
      supervisor: { name: 'Dr Supervisor' },
      supervisorBroadcast: {
        type: 'audio',
        content: '/broadcasts/message.webm',
      },
    },
    'Registration closes Friday.'
  );

  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Admin Announcement');
  assert.equal(items[0].content, 'Registration closes Friday.');
  assert.equal(items[1].title, 'Supervisor Voice Broadcast');
  assert.equal(items[1].source, 'Dr Supervisor');
});

test('fine restrictions continue to block project submission', () => {
  const result = selectors.buildStudentDashboardViewModel(
    {
      student: { status: 'Pending' },
      fineRestriction: { active: true, isCurrentStudent: true },
    },
    '',
    ''
  );

  assert.equal(result.canSubmitByStatus, true);
  assert.equal(result.isFineRestricted, true);
  assert.equal(result.canSubmit, false);
});
