import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(
  new URL('../components/dashboards/StudentDashboard.tsx', import.meta.url),
  'utf8'
);

const selector = await readFile(
  new URL(
    '../components/student/selectors/studentDashboardViewModel.ts',
    import.meta.url
  ),
  'utf8'
);

test('student dashboard imports the extracted secure-media helper', () => {
  assert.match(
    dashboard,
    /getStudentSecureMediaUrl\s+as\s+getSecureMediaUrl/
  );
  assert.match(dashboard, /getSecureMediaUrl=\{getSecureMediaUrl\}/);
  assert.match(dashboard, /pdfHref=\{getSecureMediaUrl\(pdfUrl\)\}/);
  assert.doesNotMatch(dashboard, /const getSecureMediaUrl\s*=/);
});

test('student view-model selector exports the secure-media helper', () => {
  assert.match(
    selector,
    /export function getStudentSecureMediaUrl\(url\?: string\): string/
  );
});
