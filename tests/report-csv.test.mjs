import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { buildCsv } = await importTypeScriptModule(
  'components/admin/reports/reportCsv.ts'
);

test('CSV reports include a stable header and blank notes', () => {
  assert.equal(
    buildCsv([{ label: 'Approved', value: 12 }]),
    '"Label","Value","Note"\n"Approved","12",""'
  );
});

test('CSV reports escape quotes, commas, and line breaks without losing content', () => {
  const csv = buildCsv([
    {
      label: 'Team "Alpha", Group A',
      value: 3,
      note: 'First line\nSecond "quoted" line',
    },
  ]);

  assert.equal(
    csv,
    '"Label","Value","Note"\n"Team ""Alpha"", Group A","3","First line\nSecond ""quoted"" line"'
  );
});
