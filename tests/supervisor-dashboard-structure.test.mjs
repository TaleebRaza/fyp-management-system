import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('SupervisorDashboard is a small composition component without direct network calls', async () => {
  const source = await read('components/dashboards/SupervisorDashboard.tsx');
  const lineCount = source.split(/\r?\n/).length;

  assert.ok(lineCount <= 280, `Expected at most 280 lines, found ${lineCount}.`);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.match(source, /useSupervisorProjects/);
  assert.match(source, /useSupervisorProjectFilters/);
  assert.match(source, /useSupervisorProjectActions/);
  assert.match(source, /useSupervisorExport/);
});

test('supervisor responsibilities are separated into focused modules', async () => {
  const expectedFiles = [
    'components/supervisor/api/supervisorDashboardApi.ts',
    'components/supervisor/hooks/useSupervisorFeedback.ts',
    'components/supervisor/hooks/useSupervisorProjects.ts',
    'components/supervisor/hooks/useSupervisorProjectFilters.ts',
    'components/supervisor/hooks/useSupervisorProjectActions.ts',
    'components/supervisor/hooks/useSupervisorExport.ts',
    'components/supervisor/utils/supervisorDownload.ts',
    'components/supervisor/utils/supervisorErrors.ts',
  ];

  for (const relativePath of expectedFiles) {
    const source = await read(relativePath);
    assert.ok(source.trim().length > 0, `${relativePath} must not be empty.`);
  }
});
