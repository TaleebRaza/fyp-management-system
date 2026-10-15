import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { buildSupervisorLoginReport } = await importTypeScriptModule('lib/supervisorLoginReport.ts');

test('monthly counts reset at the month boundary before ranking without changing stored users', () => {
  const supervisors = [
    { name: 'Previous leader', monthlyLoginCount: 99, lastLoginMonth: '2026-12' },
    { name: 'B', monthlyLoginCount: 2, lastLoginMonth: '2027-01' },
    { name: 'Leader', monthlyLoginCount: 5, lastLoginMonth: '2027-01' },
    { name: 'A', monthlyLoginCount: 2, lastLoginMonth: '2027-01' },
    { name: 'Never logged in' },
  ];
  assert.equal(buildSupervisorLoginReport(supervisors, new Date('2026-12-31T23:59:59Z'))[0].total, 99);
  const rows = buildSupervisorLoginReport(supervisors, new Date('2027-01-01T00:00:00Z'));
  assert.deepEqual(rows.map(({ label, total }) => [label, total]), [
    ['Leader', 5], ['A', 2], ['B', 2], ['Never logged in', 0], ['Previous leader', 0],
  ]);
  assert.equal(supervisors[0].monthlyLoginCount, 99);
});

test('shows only the last login date, with honest fallbacks for older accounts', () => {
  const rows = buildSupervisorLoginReport([
    { name: 'A', lastLoginAt: '2026-10-14T22:00:00Z' },
    { name: 'B', lastLoginMonth: '2026-09' },
    { name: 'C' },
  ]);
  assert.deepEqual(rows.map(({ note }) => note), [
    'Last login 15/10/2026',
    'Last login 2026-09 (exact date unavailable)',
    'No recorded logins',
  ]);
});
