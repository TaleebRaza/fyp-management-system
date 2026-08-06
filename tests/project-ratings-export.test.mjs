import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ExcelJS from 'exceljs';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const exportModule = await importTypeScriptModule('lib/projectRatingsExport.ts');

const proposalFilters = {
  round: 'proposal',
  minimums: {
    projectIdea: 6,
    technicalMerit: 0,
    documentationQuality: 0,
  },
};

test('validates the rating round and every 0-10 integer threshold', () => {
  assert.deepEqual(
    exportModule.parseProjectRatingsExportFilters(
      new URLSearchParams('round=proposal&projectIdea=6&technicalMerit=0&documentationQuality=10')
    ),
    {
      round: 'proposal',
      minimums: { projectIdea: 6, technicalMerit: 0, documentationQuality: 10 },
    }
  );

  for (const query of [
    'round=final&projectIdea=0&technicalMerit=0&documentationQuality=0',
    'round=proposal&projectIdea=-1&technicalMerit=0&documentationQuality=0',
    'round=proposal&projectIdea=0&technicalMerit=11&documentationQuality=0',
    'round=proposal&projectIdea=0&technicalMerit=1.5&documentationQuality=0',
    'round=proposal&projectIdea=0&technicalMerit=0',
  ]) {
    assert.equal(
      exportModule.parseProjectRatingsExportFilters(new URLSearchParams(query)),
      null
    );
  }
});

test('builds AND filters while treating zero only as an omitted threshold', () => {
  assert.deepEqual(exportModule.buildProjectRatingsExportFilter(proposalFilters), {
    'ratings.proposal': { $type: 'object' },
    'ratings.proposal.projectIdea': { $gte: 6 },
  });

  assert.deepEqual(
    exportModule.buildProjectRatingsExportFilter({
      round: 'thesis',
      minimums: { projectIdea: 7, technicalMerit: 8, documentationQuality: 9 },
    }),
    {
      'ratings.thesis': { $type: 'object' },
      'ratings.thesis.projectIdea': { $gte: 7 },
      'ratings.thesis.technicalMerit': { $gte: 8 },
      'ratings.thesis.documentationQuality': { $gte: 9 },
    }
  );
});

test('writes one sorted row per unique project member with shared project ratings', () => {
  const projects = [
    {
      _id: 'project-b',
      title: 'Beta Project',
      domain: 'Web Applications',
      stage: 'THESIS_DRAFT',
      status: 'Pending',
      supervisorId: 'supervisor-1',
      members: ['student-3'],
      ratings: {
        proposal: {
          projectIdea: 9,
          technicalMerit: 8,
          documentationQuality: 7,
          ratedAt: new Date('2026-08-05T10:00:00.000Z'),
          ratedBy: 'reviewer-1',
        },
      },
    },
    {
      _id: 'project-a',
      title: 'Alpha Project',
      domains: ['machine-learning'],
      stage: 'THESIS_DRAFT',
      status: 'Pending',
      supervisorId: 'supervisor-1',
      members: ['student-2', 'student-1', 'student-1'],
      ratings: {
        proposal: {
          projectIdea: 8,
          technicalMerit: 9,
          documentationQuality: 10,
          ratedAt: new Date('2026-08-04T10:00:00.000Z'),
          ratedBy: 'reviewer-1',
        },
      },
    },
  ];
  const users = [
    { _id: 'supervisor-1', role: 'supervisor', name: 'Dr Supervisor', email: 'sup@example.com' },
    { _id: 'reviewer-1', role: 'admin', name: 'Portal Admin' },
    { _id: 'student-1', role: 'student', name: 'Student One', rollNo: 'A-001' },
    { _id: 'student-2', role: 'student', name: 'Student Two', rollNo: 'B-002' },
    { _id: 'student-3', role: 'student', name: 'Student Three', rollNo: 'C-003' },
  ];

  assert.deepEqual(
    exportModule.getProjectRatingsExportUserIds(projects, 'proposal').sort(),
    ['reviewer-1', 'student-1', 'student-2', 'student-3', 'supervisor-1']
  );

  const rows = exportModule.buildProjectRatingsExportRows(projects, users, 'proposal');
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => [row.projectId, row.projectIdea, row.studentRollNumber]),
    [
      ['project-b', 9, 'C-003'],
      ['project-a', 8, 'A-001'],
      ['project-a', 8, 'B-002'],
    ]
  );
  assert.equal(rows[1].domains, 'Machine Learning');
  assert.equal(rows[1].reviewerName, 'Portal Admin');
  assert.equal(rows[1].supervisorEmail, 'sup@example.com');
});

test('creates a valid workbook with headers even when no projects match', async () => {
  const workbook = new ExcelJS.Workbook();
  exportModule.populateProjectRatingsWorkbook(workbook, []);
  const buffer = await workbook.xlsx.writeBuffer();

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);
  const worksheet = reopened.getWorksheet('Project Ratings');
  assert.ok(worksheet);
  assert.equal(worksheet.rowCount, 1);
  assert.deepEqual(
    worksheet.getRow(1).values.slice(1),
    exportModule.PROJECT_RATINGS_EXPORT_COLUMNS.map((column) => column.header)
  );
});

test('uses the dated filename and a dedicated admin-only, storage-free route', async () => {
  assert.equal(
    exportModule.getProjectRatingsExportFilename('thesis', new Date('2026-08-06T10:00:00.000Z')),
    'project-ratings-thesis-2026-08-06.xlsx'
  );

  const route = await readFile(
    new URL('../app/api/admin/project-ratings-export/route.ts', import.meta.url),
    'utf8'
  );
  assert.match(route, /requireCurrentUser\(req, \['admin'\]\)/);
  assert.match(route, /Project\.find\(buildProjectRatingsExportFilter\(filters\)\)/);
  assert.equal((route.match(/User\.find\(/g) || []).length, 1);
  assert.doesNotMatch(route, /s3|R2|writeFile|StorageDeletion/i);
});
