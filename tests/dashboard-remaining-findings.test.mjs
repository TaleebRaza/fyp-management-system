import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function loadModule(path, modules) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, console, Buffer, URL,
    require(name) {
      const entry = Object.entries(modules).find(([suffix]) => name.endsWith(suffix));
      assert.ok(entry, `Unexpected dependency: ${name}`);
      return entry[1];
    },
  });
  return exports;
}

const request = (query = '') => ({ nextUrl: new URL(`http://localhost/api/test${query}`) });
const plain = (value) => JSON.parse(JSON.stringify(value));

test('scoped reports retain matching rows and summary counts while skipping unrelated joins/details', async () => {
  let authenticated = true;
  const pipelines = [];
  const userFacets = {
    studentsPerSupervisor: [{ _id: 'sup-1', total: 2, active: 1, deactivated: 1 }],
    studentActivity: [{ _id: 'Active', total: 1 }, { _id: 'Deactivated', total: 1 }],
    programs: [{ _id: 'BSCS', total: 2 }], batches: [{ _id: 'Fall 2026', total: 2 }],
    studentTotals: [{ students: 1, activeStudents: 1, deactivatedStudents: 1, assignedStudents: 2, unassignedStudents: 0 }],
    finedStudents: [], collectedFineStudents: [], outstandingFineSummary: [{ total: 0, totalFineAmount: 0 }],
  };
  const route = await loadModule('app/api/admin/reports/route.ts', {
    'next/server': { NextResponse: Response }, '/mongodb': async () => {},
    '/security/auth': { requireCurrentUser: async () => authenticated ? { id: 'admin-1' } : null },
    '/fineRestriction': { buildFineRestriction: () => null, buildCollectedFineSummary: () => null },
    '/projectReviewPolicy': { APPROVED_PROJECT_STAGES: [], REVIEWED_PROJECT_STATUSES: [] },
    '/models/User': {
      aggregate: async (pipeline) => {
        pipelines.push(plain(pipeline));
        const facets = pipeline.find((stage) => stage.$facet).$facet;
        return [Object.fromEntries(Object.keys(facets).map((key) => [key, userFacets[key]]))];
      },
      find: () => ({ select: () => ({ lean: async () => [{ _id: 'sup-1', name: 'Supervisor', monthlyLoginCount: 3 }] }) }),
      countDocuments: async () => 1,
    },
    '/models/Project': { aggregate: async () => [{ _id: { status: 'Pending', stage: 'PROPOSAL' }, projects: 1, students: 2, withPdf: 1, waitingForReview: 1, approved: 0 }] },
  });
  const full = await (await route.GET(request())).json();
  for (const report of ['studentsPerSupervisor', 'studentStatusSummary', 'studentActivitySummary', 'programSummary', 'batchSummary', 'projectStatusSummary', 'projectStageSummary', 'pdfReviewSummary', 'finedStudents', 'collectedFineStudents', 'supervisorLoginCounts']) {
    const response = await route.GET(request(`?report=${report}`));
    assert.equal(response.status, 200);
    const scoped = await response.json();
    assert.deepEqual(scoped[report], full[report]);
    for (const key of ['students', 'supervisors', 'projects', 'reviewQueue', 'finedStudents', 'totalFineAmount']) {
      assert.equal(scoped.totals[key], full.totals[key]);
    }
    assert.deepEqual(Object.keys(scoped).sort(), ['generatedAt', 'totals', report].sort());
    const needsAssignment = ['studentsPerSupervisor', 'studentStatusSummary'].includes(report);
    assert.equal(pipelines.at(-1).some((stage) => stage.$lookup), needsAssignment);
    if (!needsAssignment) {
      assert.equal(JSON.stringify(pipelines.at(-1)).includes('$canonicalProject'), false);
    }
  }
  assert.equal((await route.GET(request('?report=toString'))).status, 400);
  authenticated = false;
  const reads = pipelines.length;
  assert.equal((await route.GET(request('?report=programSummary'))).status, 401);
  assert.equal(pipelines.length, reads);
});

test('Home Viva preview returns only three upcoming titles and preserves full workspace access', async () => {
  let authenticated = true;
  const calls = [];
  const sessions = [
    { id: 'completed', phase: 'completed', scheduledAt: '2026-01-01', project: { title: 'Completed', description: 'private detail' } },
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `session-${index}`, phase: index === 0 ? 'running' : 'scheduled', scheduledAt: `2026-10-${10 + index}`,
      project: { title: index === 0 ? 'Snapshot title' : `Live title ${index}`, description: 'Long details', members: ['student'] },
      panel: { members: ['examiner'] }, gradeScale: ['A', 'B'],
    })),
  ];
  const route = await loadModule('app/api/dashboard/supervisor/viva/route.ts', {
    'next/server': { NextResponse: Response },
    '/security/auth': { requireCurrentUser: async () => authenticated ? { id: 'examiner-1' } : null },
    '/security/input': { isRecord: () => true },
    '/security/request': {
      JSON_BODY_LIMITS: { form: 1000 },
      readBoundedJson: async () => ({ ok: true, value: { action: 'requeue-session', sessionId: 'session-1', version: 0 } }),
    },
    '/vivaSessionDashboard': {
      getVivaPanelSessions: async (...args) => { calls.push(args); return sessions; },
      requeueVivaSession: async () => ({ success: true }),
    },
  });
  const preview = await (await route.GET(request('?preview=1'))).json();
  assert.deepEqual(calls[0], ['examiner-1', true]);
  assert.deepEqual(preview.sessions, sessions.slice(1, 4).map(({ id, phase, scheduledAt, project }) => ({ id, phase, scheduledAt, project: { title: project.title } })));
  assert.deepEqual((await (await route.GET(request())).json()).sessions, sessions);
  assert.deepEqual(calls[1], ['examiner-1', false]);
  // Mutation callbacks still need full workspaces even if a preview query is present.
  const requeued = await (await route.POST(request('?preview=1'))).json();
  assert.deepEqual(requeued.sessions, sessions);
  assert.deepEqual(calls[2], ['examiner-1']);
  authenticated = false;
  assert.equal((await route.GET(request('?preview=1'))).status, 401);
  assert.equal(calls.length, 3);
});

test('student dashboard keeps text/audio broadcasts once and limits supervisor fields to contact details', async () => {
  let supervisor = { _id: 'sup-1', name: 'Supervisor', email: 'sup@example.test' };
  const service = await loadModule('lib/features/student/dashboard.ts', {
    '/config/projectDomains': { normalizeProjectDomainIds: () => [], formatProjectDomainLabels: () => '' },
    '/config/projectRatings': { getSafeProjectRatings: () => ({}) },
    '/models/User': { findById: () => ({ select: () => ({ lean: async () => supervisor }) }) },
    '/models/Project': { findOne: () => ({ select: () => ({ lean: () => ({ exec: async () => ({ _id: 'project-1', supervisorId: 'sup-1', members: [] }) }) }) }) },
    '/fineRestriction': { buildFineRestriction: () => null },
    '/registrationPolicy': { getOrCreateRegistrationPolicy: async () => ({}), serializeRegistrationPolicy: () => ({}) },
    '/teamFineRestriction': { getTeamFineRestrictionFromMembers: () => null },
    '/vivaResults': { getCompletedVivaResultsForStudent: async () => [] },
    '/vivaScheduling': { getConfirmedVivaSchedulesForStudent: async () => [] },
  });
  for (const type of ['text', 'audio']) {
    supervisor = { ...supervisor, broadcastType: type, broadcastContent: type === 'text' ? 'Hello team' : 'voice/object.webm', broadcastSize: 123, broadcastCreatedAt: '2026-10-09' };
    const data = plain(await service.getStudentDashboard({ id: 'student-1' }));
    assert.deepEqual(data.supervisor, { _id: 'sup-1', name: 'Supervisor', email: 'sup@example.test' });
    assert.deepEqual(data.supervisorBroadcast, { type, content: supervisor.broadcastContent, size: 123, createdAt: '2026-10-09', supervisorName: 'Supervisor' });
  }
  supervisor = null;
  const data = await service.getStudentDashboard({ id: 'student-1' });
  assert.equal(data.supervisor, null);
  assert.equal(data.supervisorBroadcast, null);
});

test('assigned status pages shortlist projects, retain canonical checks and omit optional metadata reads', async () => {
  const calls = [];
  const rows = [{ _id: 'student-2', createdAt: new Date('2026-10-09'), status: 'Pending' }];
  let globalReads = 0;
  const model = (name) => ({
    collection: { name: name === 'User' ? 'users' : 'projects' },
    aggregate: async (pipeline) => {
      calls.push({ name, pipeline: plain(pipeline) });
      return [{ rows, metadata: [{ total: 42 }] }];
    },
    distinct: async () => { globalReads++; return ['Fall 2026']; },
    countDocuments: async () => { globalReads++; return 42; },
  });
  class ObjectId { constructor(id) { this.id = id; } static isValid() { return true; } }
  const route = await loadModule('app/api/admin/students/route.ts', {
    'next/server': { NextResponse: Response }, mongoose: { Types: { ObjectId } },
    '/mongodb': async () => {}, '/rollNo': { normalizeRollNo: (value) => value },
    '/security/auth': { requireCurrentUser: async () => ({ id: 'admin-1' }) },
    '/security/input': {}, '/models/User': model('User'), '/models/Project': model('Project'),
  });
  const cursor = Buffer.from(JSON.stringify({ createdAt: '2026-10-10', id: 'previous-student' })).toString('base64url');
  const req = (query) => {
    const url = `http://localhost/api/admin/students${query}`;
    return { url, nextUrl: new URL(url) };
  };
  const response = await route.GET(req(`?status=Pending&page=2&cursor=${cursor}&metadata=0&batch=Fall%202026`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pagination.total, 42);
  assert.equal(body.pagination.page, 2);
  assert.equal(body.students[0].status, 'Pending');
  assert.equal(globalReads, 0);
  const { name, pipeline } = calls[0];
  assert.equal(name, 'Project');
  assert.deepEqual(pipeline[0].$match, { status: 'Pending', supervisorId: { $type: 'objectId' } });
  assert.deepEqual(pipeline.find((stage) => stage.$group).$group, { _id: '$members' });
  const canonical = pipeline.find((stage) => stage.$lookup?.from === 'projects').$lookup;
  assert.equal(canonical.foreignField, 'members');
  assert.equal(canonical.pipeline.at(-1).$limit, 1);
  const facet = pipeline.at(-1).$facet;
  assert.deepEqual(facet.metadata, [{ $count: 'total' }]);
  assert.deepEqual(facet.rows[1].$sort, { createdAt: -1, _id: -1 });
  assert.equal(facet.rows[2].$limit, 20);
  assert.equal((await route.GET(req('?status=Unassigned'))).status, 200);
  assert.equal(calls[1].name, 'User');
  assert.equal((await route.GET(req('?status=Pending&page=2'))).status, 400);
  assert.equal(calls.length, 2);
});
