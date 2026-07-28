import { readdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const testFiles = readdirSync(testsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.test.mjs'))
  .map((entry) => path.join(testsDirectory, entry.name))
  .sort();

if (testFiles.length === 0) {
  console.error('No unit test files were found in the tests directory.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: path.resolve(testsDirectory, '..'),
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`Unable to start the Node.js test runner: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
