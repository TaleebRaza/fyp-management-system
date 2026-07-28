import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { toReportRows } = await importTypeScriptModule(
  'components/admin/reports/reportSelectors.ts'
);

test('report selectors return no rows before report data loads', () => {
  assert.deepEqual(toReportRows(null, 'programSummary'), []);
});

test('report selectors normalize supervisor and program summaries', () => {
  const data = {
    studentsPerSupervisor: [
      { label: '', total: '4', active: '3', deactivated: '1' },
    ],
    programSummary: [
      { label: 'BSCS', total: '7' },
      { label: 'CUSTOM', total: 2 },
      { label: '', total: 1 },
    ],
  };

  assert.deepEqual(toReportRows(data, 'studentsPerSupervisor'), [
    {
      label: 'Unknown Supervisor',
      value: 4,
      note: '3 active, 1 deactivated',
    },
  ]);
  assert.deepEqual(toReportRows(data, 'programSummary'), [
    { label: 'BS Computer Science', value: 7 },
    { label: 'CUSTOM', value: 2 },
    { label: 'No Program', value: 1 },
  ]);
});

test('fine reports preserve amount and explanatory context', () => {
  const data = {
    finedStudents: [
      {
        label: 'Student A',
        fineAmount: '50',
        fineBreakdown: '5 days × PKR 10',
        program: 'BSAI',
        batch: 'Fall 2023',
      },
      {
        label: '',
        fineAmount: undefined,
        daysLate: '2',
      },
    ],
  };

  assert.deepEqual(toReportRows(data, 'finedStudents'), [
    {
      label: 'Student A',
      value: 50,
      note: '5 days × PKR 10 · BSAI · Fall 2023',
    },
    {
      label: 'Unknown Student',
      value: 0,
      note: '2 day(s) late · No Program · No Batch',
    },
  ]);
});

test('unknown report identifiers fall back to the PDF review summary', () => {
  const data = { pdfReviewSummary: [{ label: 'Waiting', total: 8 }] };
  assert.deepEqual(toReportRows(data, 'unexpected-report-id'), [
    { label: 'Waiting', value: 8 },
  ]);
});
