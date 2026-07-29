import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const api = await importTypeScriptModule(
  'components/student/api/studentDashboardApi.ts'
);

function jsonResponse(data, { ok = true } = {}) {
  return {
    ok,
    async json() {
      return data;
    },
  };
}

async function withMockFetch(handler, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test('loads the student dashboard with the unchanged route and no-store policy', async () => {
  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/dashboard/student?id=user%2F1');
    assert.deepEqual(init, { cache: 'no-store' });
    return jsonResponse({ student: { name: 'Student One' } });
  }, async () => {
    const result = await api.getStudentDashboard('user/1');
    assert.equal(result.student.name, 'Student One');
  });
});

test('loads the existing headline and supervisor endpoints', async () => {
  const calls = [];
  await withMockFetch(async (url) => {
    calls.push(url);
    if (url === '/api/headline') {
      return jsonResponse({ headline: { text: 'Important update' } });
    }
    return jsonResponse([{ _id: 'sup-1', name: 'Supervisor', filledSlots: 1, maxSlots: 5 }]);
  }, async () => {
    assert.equal(await api.getStudentHeadline(), 'Important update');
    const supervisors = await api.getStudentSupervisors();
    assert.equal(supervisors.length, 1);
  });
  assert.deepEqual(calls, ['/api/headline', '/api/supervisors']);
});

test('filters malformed template records while preserving the stage route', async () => {
  await withMockFetch(async (url) => {
    assert.equal(url, '/api/templates?stage=PROPOSAL%20REVIEW');
    return jsonResponse({
      templates: [
        {
          id: 'valid',
          title: 'Proposal',
          filename: 'proposal.docx',
          format: 'word',
          content: '<p>Template</p>',
        },
        { id: 'invalid', format: 'pdf' },
      ],
    });
  }, async () => {
    const templates = await api.getStudentTemplates('PROPOSAL REVIEW');
    assert.deepEqual(templates.map((item) => item.id), ['valid']);
  });
});

test('preserves the secure PDF token and upload request contracts', async () => {
  const file = {
    name: 'proposal.pdf',
    type: 'application/pdf',
    size: 1024,
  };
  const calls = [];

  await withMockFetch(async (url, init) => {
    calls.push([url, init]);
    if (url === '/api/upload') {
      return jsonResponse({ uploadUrl: 'https://upload.example/file', url: 'files/proposal.pdf' });
    }
    return jsonResponse({});
  }, async () => {
    const result = await api.uploadStudentPdf(file);
    assert.deepEqual(result, { url: 'files/proposal.pdf', fileSize: 1024 });
  });

  assert.equal(calls[0][0], '/api/upload');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    filename: 'proposal.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
  });
  assert.equal(calls[1][0], 'https://upload.example/file');
  assert.equal(calls[1][1].method, 'PUT');
  assert.equal(calls[1][1].headers['Content-Type'], 'application/pdf');
  assert.equal(calls[1][1].body, file);
});

test('rejects non-PDF and oversized files before making a request', async () => {
  let requestCount = 0;
  await withMockFetch(async () => {
    requestCount += 1;
    return jsonResponse({});
  }, async () => {
    await assert.rejects(
      () => api.uploadStudentPdf({ name: 'notes.txt', type: 'text/plain', size: 5 }),
      /Only PDF documents/
    );
    await assert.rejects(
      () => api.uploadStudentPdf({ name: 'large.pdf', type: 'application/pdf', size: 4 * 1024 * 1024 + 1 }),
      /4MB limit/
    );
  });
  assert.equal(requestCount, 0);
});

test('submits a named student project action', async () => {
  const input = {
    id: 'student-1',
    title: 'Project title',
    desc: 'Project description',
    domains: ['AI', 'WEB'],
    tools: 'Next.js, MongoDB',
    pdfUrl: 'files/project.pdf',
    fileSize: 2048,
  };

  await withMockFetch(async (url, init) => {
    assert.equal(url, '/api/dashboard/student');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { ...input, action: 'submitProject' });
    return jsonResponse({ message: 'Submitted' });
  }, async () => {
    const result = await api.submitStudentProject(input);
    assert.equal(result.message, 'Submitted');
  });
});

test('propagates server errors instead of hiding them', async () => {
  await withMockFetch(async () => jsonResponse({ error: 'Fine must be cleared.' }, { ok: false }), async () => {
    await assert.rejects(
      () => api.getStudentDashboard('student-1'),
      /Fine must be cleared\./
    );
  });
});
