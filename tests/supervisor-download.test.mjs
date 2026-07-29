import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { getSupervisorExportFilename } = await importTypeScriptModule(
  'components/supervisor/utils/supervisorDownload.ts'
);

test('supervisor export filenames preserve the existing naming rule', () => {
  assert.equal(
    getSupervisorExportFilename('Dr. Ayesha Khan'),
    'fyp-report-Dr.-Ayesha-Khan.xlsx'
  );
  assert.equal(
    getSupervisorExportFilename('Supervisor'),
    'fyp-report-Supervisor.xlsx'
  );
});
