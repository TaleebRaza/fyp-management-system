import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const selectors = await importTypeScriptModule(
  'components/admin/selectors/adminDashboardSelectors.ts'
);

test('filters supervisors across name, ID, email, and migration code', () => {
  const supervisors = [
    { _id: '1', name: 'Ayesha Khan', rollNo: 'SUP-01', email: 'ayesha@example.com', migrationCode: 'MOVE01' },
    { _id: '2', name: 'Bilal Ahmed', rollNo: 'SUP-02', email: 'bilal@example.com', migrationCode: 'MOVE02' },
  ];

  assert.deepEqual(
    selectors.filterAdminSupervisors(supervisors, 'move02').map((item) => item._id),
    ['2']
  );
  assert.deepEqual(
    selectors.filterAdminSupervisors(supervisors, '  AYESHA  ').map((item) => item._id),
    ['1']
  );
});

test('returns the original supervisor array for an empty search', () => {
  const supervisors = [{ _id: '1', name: 'Ayesha Khan' }];
  assert.equal(selectors.filterAdminSupervisors(supervisors, '   '), supervisors);
});

test('builds dashboard statistics from the currently loaded students', () => {
  const stats = selectors.buildAdminStats(
    [
      { _id: '1', name: 'One', status: 'Approved', isActive: true },
      { _id: '2', name: 'Two', status: 'Pending', isActive: false },
      { _id: '3', name: 'Three', status: 'Unassigned' },
    ],
    54,
    7
  );

  assert.deepEqual(stats, {
    totalStudents: 54,
    loadedStudents: 3,
    activeStudents: 2,
    pendingStudents: 2,
    supervisors: 7,
  });
});

test('generates Spring and Fall batch options through next year', () => {
  const options = selectors.createAdminBatchOptions(2026);
  assert.equal(options[0], 'Spring 2021');
  assert.equal(options[1], 'Fall 2021');
  assert.equal(options.at(-2), 'Spring 2027');
  assert.equal(options.at(-1), 'Fall 2027');
});

test('clamps supervisor extra slots to the configured range', () => {
  assert.equal(selectors.clampSupervisorExtraSlots(-4, 10), 0);
  assert.equal(selectors.clampSupervisorExtraSlots(6, 10), 6);
  assert.equal(selectors.clampSupervisorExtraSlots(99, 10), 10);
});

test('creates the existing six-character uppercase migration-code format', () => {
  assert.equal(selectors.createSupervisorMigrationCode(0.123456789), '4FZZZX');
});
