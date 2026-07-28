import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { buildReportHtml } = await importTypeScriptModule(
  'components/admin/reports/reportHtml.ts'
);

test('HTML reports escape report metadata and row content', () => {
  const html = buildReportHtml(
    {
      generatedAt: '2026-07-28T10:00:00.000Z',
      totals: { students: 10, supervisors: 2, projects: 5, reviewQueue: 3 },
    },
    {
      id: 'programSummary',
      label: '<script>alert("title")</script>',
      description: 'Unsafe <img src=x onerror=alert(1)> description',
    },
    [
      {
        label: '<b>BSCS</b>',
        value: 4,
        note: 'Note with <script>alert(1)</script> & quotes "\'',
      },
    ]
  );

  assert.match(html, /&lt;script&gt;alert\(&quot;title&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Unsafe &lt;img src=x onerror=alert\(1\)&gt; description/);
  assert.match(html, /&lt;b&gt;BSCS&lt;\/b&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; quotes &quot;&#039;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
});

test('collected-fine HTML reports calculate the total without changing rows', () => {
  const html = buildReportHtml(
    { totals: {} },
    { id: 'collectedFineStudents', label: 'Collected fines', description: 'Fine collection' },
    [
      { label: 'Student A', value: 20 },
      { label: 'Student B', value: 30 },
    ]
  );

  assert.match(html, /Total collected: PKR 50/);
  assert.match(html, /<td>Student A<\/td><td>20<\/td>/);
  assert.match(html, /<td>Student B<\/td><td>30<\/td>/);
});

test('empty HTML reports render a clear empty state', () => {
  const html = buildReportHtml(
    { totals: {} },
    { id: 'batchSummary', label: 'Batches', description: 'Batch totals' },
    []
  );

  assert.match(html, /No data available for this report\./);
});
