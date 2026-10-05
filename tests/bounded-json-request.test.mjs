import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { readBoundedJson } = await importTypeScriptModule('lib/security/request.ts');

test('bounded JSON reader accepts valid JSON and rejects malformed or unsupported bodies', async () => {
  const valid = await readBoundedJson(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ ok: true }),
  }), 64);
  assert.deepEqual(valid, { ok: true, value: { ok: true } });

  const malformed = await readBoundedJson(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  }), 64);
  assert.equal(malformed.response.status, 400);

  const unsupported = await readBoundedJson(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '{}',
  }), 64);
  assert.equal(unsupported.response.status, 415);
});

test('bounded JSON reader enforces declared and actual byte limits', async () => {
  const exactBoundary = await readBoundedJson(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify('x'.repeat(62)),
  }), 64);
  assert.equal(exactBoundary.ok, true);

  const oneByteOver = await readBoundedJson(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify('x'.repeat(63)),
  }), 64);
  assert.equal(oneByteOver.response.status, 413);

  const declared = await readBoundedJson(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': '65' },
    body: '{}',
  }), 64);
  assert.equal(declared.response.status, 413);

  const streamed = await readBoundedJson(new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ value: 'x'.repeat(64) })));
        controller.close();
      },
    }),
    duplex: 'half',
  }), 64);
  assert.equal(streamed.response.status, 413);
});

test('milestones 10 and 11 remove duplicate status lookup and offset pagination', async () => {
  const [studentsRoute, queue, projectModel] = await Promise.all([
    readFile(new URL('../app/api/admin/students/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/projectReviewQueue.ts', import.meta.url), 'utf8'),
    readFile(new URL('../models/Project.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(studentsRoute, /\(!status \|\| status === 'All'\) && pageStudentIds\.length > 0/);
  assert.doesNotMatch(queue, /\.skip\(/);
  assert.match(queue, /\.sort\(\{ updatedAt: -1, _id: -1 \}\)/);
  assert.match(projectModel, /index\(\{ status: 1, updatedAt: -1, _id: -1 \}\)/);
});
