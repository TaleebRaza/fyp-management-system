import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8');
}

const headline = read('components/admin/hooks/useAdminHeadline.ts');
const students = read('components/admin/hooks/useAdminStudents.ts');
const supervisors = read('components/admin/hooks/useAdminSupervisors.ts');

test('mount effects do not invoke state-setting refresh callbacks synchronously', () => {
  assert.doesNotMatch(headline, /useEffect\(\(\) => \{\s*void refreshHeadline\(\)/s);
  assert.doesNotMatch(students, /useEffect\(\(\) => \{\s*void refreshStudents\(/s);
  assert.doesNotMatch(supervisors, /useEffect\(\(\) => \{\s*void refreshSupervisors\(\)/s);
});

test('effect-driven requests ignore stale responses during cleanup', () => {
  for (const [name, source] of [
    ['headline hook', headline],
    ['student hook', students],
    ['supervisor hook', supervisors],
  ]) {
    assert.match(source, /let ignore = false;/, name);
    assert.match(source, /return \(\) => \{\s*ignore = true;\s*\};/s, name);
  }
});

test('student loading state is started outside the request effect', () => {
  assert.match(students, /useState\(true\)/);
  assert.match(students, /setTimeout\(\(\) => \{\s*setIsLoading\(true\);/s);
  assert.match(students, /handlePageChange[\s\S]*setIsLoading\(true\);\s*setPage\(nextPage\);/);
});
