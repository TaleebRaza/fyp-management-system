import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('overview excludes retained PDFs after approval, progression, and completion', async () => {
  const projects = ['Submitted For Review', 'Document Approved', 'Pending', 'Approved', 'Changes Requested']
    .map((status) => ({ status, pdfUrl: 'retained.pdf' }));
  projects.push({ status: 'Submitted For Review', pdfUrl: '' });
  const code = ts.transpileModule(await source('app/api/admin/summary/route.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, console,
    require(name) {
      if (name === 'next/server') return { NextResponse: Response };
      if (name.endsWith('/security/auth')) return { requireCurrentUser: async () => ({ id: 'admin' }) };
      if (name.endsWith('/models/User')) return { aggregate: async () => [], countDocuments: async () => 0 };
      if (name.endsWith('/models/Project')) return {
        countDocuments: async (filter) => !filter ? projects.length : projects.filter((project) =>
          project.status === filter.status && typeof project.pdfUrl === 'string' && project.pdfUrl !== filter.pdfUrl.$ne
        ).length,
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  assert.equal((await (await exports.GET({})).json()).reviewQueue, 1);
  projects[0].status = 'Document Approved';
  assert.equal((await (await exports.GET({})).json()).reviewQueue, 0);
  projects[0].status = 'Pending';
  assert.equal((await (await exports.GET({})).json()).reviewQueue, 0);
});

test('reports count only currently submitted documents', async () => {
  const reports = await source('app/api/admin/reports/route.ts');
  assert.ok(reports.includes("{ $and: ['$hasPdf', { $eq: ['$status', 'Submitted For Review'] }] }"));
});

test('project dialog guards every close path while processing', async () => {
  const dialog = await source('components/supervisor/SupervisorProjectDialog.tsx');
  assert.match(dialog, /const handleClose = \(\) => \{\s*if \(isProcessingAction\) return;/);
  assert.match(dialog, /onClose=\{handleClose\}/);
  assert.match(dialog, /disabled=\{isProcessingAction\} onClick=\{handleClose\}>Close/);
});

test('admin and supervisor keep the project dialog until refresh finishes', async () => {
  const admin = await source('components/admin/AdminProjectReviewsPanel.tsx');
  const supervisor = await source('components/supervisor/hooks/useSupervisorProjectActions.ts');
  assert.match(admin, /await fetchProjects\(\{ showLoading: false, forceRefresh: true \}\);\s*setSelectedProject\(null\);/);
  assert.match(supervisor, /await refreshProjects\(\);\s*closeProject\(\);\s*notify\(\s*response.completed/);
});
