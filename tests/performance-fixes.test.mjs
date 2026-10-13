import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function load(path, modules = {}) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, Date, URL, console: { ...console, warn() {} },
    require(name) {
      const found = Object.entries(modules).find(([suffix]) => name.endsWith(suffix));
      assert.ok(found, `Unexpected import: ${name}`);
      return found[1];
    },
  });
  return exports;
}

test('transaction helper restarts invite collisions, preserves business errors and always ends sessions', async () => {
  let callbacks = 0;
  let ends = 0;
  const api = await load('lib/transaction.ts', {
    mongoose: { startSession: async () => ({
      withTransaction: async (run) => { callbacks++; return run(); },
      endSession: async () => { ends++; },
    }) },
  });
  const collision = Object.assign(new Error('duplicate invite'), { code: 11000, keyPattern: { inviteCode: 1 } });
  let attempts = 0;
  assert.equal(await api.withTransaction(async () => {
    if (++attempts === 1) throw collision;
    return 'saved';
  }), 'saved');
  assert.equal(callbacks, 2);
  assert.equal(ends, 1);
  const businessError = new Error('no slots');
  await assert.rejects(api.withTransaction(async () => { throw businessError; }), (error) => error === businessError);
  assert.equal(callbacks, 3);
  assert.equal(ends, 2);
  attempts = 0;
  await assert.rejects(api.withTransaction(async () => { attempts++; throw collision; }), (error) => error === collision);
  assert.equal(attempts, 5);
  assert.equal(ends, 3);
  assert.equal(await api.withTransaction(async () => {}), undefined);
});

test('shared-write admission serializes transactions, bounds waiting jobs and releases after errors', async () => {
  const api = await load('lib/transaction.ts', {
    mongoose: { startSession: async () => ({ withTransaction: (run) => run(), endSession: async () => {} }) },
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let active = 0;
  let peak = 0;
  const jobs = Array.from({ length: 256 }, (_, index) => api.withSharedWriteTransaction(async () => {
    peak = Math.max(peak, ++active);
    try { await gate; if (index === 0) throw new Error('rolled back'); return index; }
    finally { active--; }
  }));
  const result = Promise.allSettled(jobs);
  await assert.rejects(api.withSharedWriteTransaction(async () => {}), (error) => error.statusCode === 503);
  release();
  assert.equal((await result).filter(({ status }) => status === 'fulfilled').length, 255);
  assert.equal(peak, 1);
  assert.equal(await api.withSharedWriteTransaction(async () => 'recovered'), 'recovered');
});

test('cleanup drains beyond 25 jobs, combines counts and stops at its time budget', async () => {
  const { drainBatches } = await load('lib/drainBatches.ts');
  let remaining = 75;
  let calls = 0;
  const run = async () => {
    const claimed = Math.min(25, remaining);
    remaining -= claimed;
    return { claimed, deleted: claimed, maxJobLagMs: ++calls, oldestDeadLetterAgeMs: 10 };
  };
  const total = await drainBatches(run, (batch) => batch.claimed === 25, Date.now() + 1000);
  assert.equal(total.deleted, 75);
  assert.equal(total.maxJobLagMs, 4);
  assert.equal(total.oldestDeadLetterAgeMs, 10);
  remaining = 75;
  const bounded = await drainBatches(run, () => true, Date.now() - 1);
  assert.equal(bounded.claimed, 25);
  assert.equal(remaining, 50);
});

test('reference checks preserve legacy URL/encoded keys, exclusions and Viva snapshot sharing', async () => {
  const { normalizeStorageKey } = await load('lib/storageValidation.ts');
  const candidate = 'proposals/student/file.pdf';
  const returned = [];
  const model = (rows) => ({ find(filter) {
    const field = Object.keys(filter.$or[0])[0];
    const value = (row) => field === 'projectSnapshot.pdfUrl' ? row.projectSnapshot?.pdfUrl : row[field];
    const hits = rows.filter((row) => !filter._id?.$nin.includes(row._id)
      && (!filter.role || filter.role === row.role)
      && (!filter.broadcastType || filter.broadcastType === row.broadcastType)
      && (!filter.studentMessageType || filter.studentMessageType === row.studentMessageType)
      && (filter.$or[0][field].$in.includes(value(row)) || filter.$or[1][field].$regex.test(value(row) || '')));
    returned.push(...hits);
    const query = { select: () => query, session: () => query, lean: async () => hits };
    return query;
  } });
  const references = [candidate, `https://storage.example/${candidate}?signed=1`, ` /${candidate} `,
    '%2570roposals/student/file.pdf', 'HTTPS://storage.example/proposals/student/file.pdf'];
  const api = await load('lib/storageReferenceSafety.ts', {
    '/storageValidation': { normalizeStorageKey },
    '/models/Project': model(references.map((pdfUrl, index) => ({ _id: index, pdfUrl })).concat({ _id: 'unrelated', pdfUrl: 'proposals/other/file.pdf' })),
    '/models/VoiceNote': model([]), '/models/User': model([]),
    '/models/VivaSession': model([{ _id: 'viva', projectSnapshot: { pdfUrl: candidate } }]),
  });
  assert.deepEqual([...await api.findSharedStorageKeys({ keys: [candidate], excludedProjectIds: [0], session: {} })], [candidate]);
  assert.equal(returned.some(({ _id }) => _id === 0 || _id === 'unrelated'), false);
  assert.equal(returned.length, 5);
  returned.length = 0;
  assert.equal((await api.findSharedStorageKeys({ keys: [candidate], excludedProjectIds: [0, 1, 2, 3, 4], excludedVivaSessionIds: ['viva'], session: {} })).size, 0);
});

test('reset confirms a saved mutation before a delayed refresh and never labels refresh failure as reset failure', async () => {
  const { refreshAfterSave } = await load('components/refreshAfterSave.ts');
  let rejectRefresh;
  let refreshStarted;
  const started = new Promise((resolve) => { refreshStarted = resolve; });
  const pending = new Promise((_, reject) => { rejectRefresh = reject; });
  const dialogs = [];
  const { useStudentTeamActions } = await load('components/student/hooks/useStudentTeamActions.ts', {
    '/refreshAfterSave': { refreshAfterSave },
    react: { useCallback: (fn) => fn, useState: (initial) => [initial, () => {}] },
    '/studentWorkflowApi': { resetStudentProject: async () => ({ message: 'Saved' }) },
  });
  const hook = useStudentTeamActions({
    resetProjectDraft: async () => {}, resetTemplates() {}, showDialog: (dialog) => dialogs.push(dialog),
    refreshDashboard: () => { refreshStarted(); return pending; }, refreshSupervisors: async () => {},
  });
  hook.handleResetProject();
  const completion = dialogs[0].onConfirm();
  await started;
  assert.equal(dialogs.at(-1).title, 'Project reset');
  rejectRefresh(new Error('GET failed'));
  await completion;
  assert.equal(dialogs.at(-1).title, 'Change saved; refresh needed');
  assert.equal(dialogs.some(({ title }) => title === 'Project reset failed'), false);
});

test('preflight reuses known members while retaining teammate fine checks and legacy lookup', async () => {
  let projectReads = 0;
  const student = { _id: 'student', name: 'Student' };
  const teammate = { _id: 'teammate', name: 'Teammate', rollNo: 'F23-0001', fine: true };
  const query = (result) => { const q = { select: () => q, lean: async () => result }; return q; };
  const api = await load('lib/teamFineRestriction.ts', {
    '/fineRestriction': { buildFineRestriction: (member) => member.fine, OUTSTANDING_STUDENT_FINE_FILTER: {} },
    '/models/Project': { findById: () => { projectReads++; return query({ members: ['student', 'teammate'] }); } },
    '/models/User': { find: (filter) => query([student, teammate].filter((member) => filter._id.$in.includes(member._id))) },
  });
  const reused = await api.getTeamFineRestriction('project', 'student', ['student', 'teammate']);
  assert.equal(projectReads, 0);
  assert.equal(reused.member.id, 'teammate');
  assert.equal(reused.isCurrentStudent, false);
  const fallback = await api.getTeamFineRestriction('project', 'student');
  assert.equal(projectReads, 1);
  assert.equal(fallback.member.id, reused.member.id);
});

test('Viva preview skips invalid candidates, handles tied dates and stops after three valid snapshots', async () => {
  const actor = 'examiner';
  const person = { userId: actor, name: 'Examiner', rollNo: 'EMP-1' };
  const date = new Date('2026-10-13T10:00:00Z');
  const rows = Array.from({ length: 50 }, (_, index) => ({
    _id: String(index).padStart(3, '0'), panelId: 'panel', roundId: 'round', projectId: 'project', version: 0,
    scheduledAt: date, startedAt: date, vivaEndsAt: new Date(date.getTime() + 600000),
    roundSnapshot: { name: 'Round', vivaDurationMinutes: 10 },
    projectSnapshot: { projectId: 'project', title: `Title ${index}`, members: [person] },
    panelSnapshot: index < 6 ? null : { panelId: 'panel', panelAdmin: person, examiners: [person] },
  }));
  const reads = [];
  const query = (result) => { const q = { select: () => q, lean: async () => result }; return q; };
  const api = await load('lib/vivaSessionDashboard.ts', {
    mongoose: { Types: { ObjectId: { isValid: () => true } } },
    '/models/VivaPanel': { find: () => query([{ _id: 'panel', examinerIds: [actor] }]) },
    '/models/VivaSession': { find(filter) {
      let limit = 0;
      const q = { select: () => q, sort: () => q, limit: (value) => { limit = value; return q; },
        lean: async () => {
          const after = filter.$or?.[1]?._id.$gt;
          const result = rows.filter((row) => !after || row._id > after).slice(0, limit || rows.length);
          reads.push(result.length);
          return result;
        } };
      return q;
    } },
    '/models/Project': {}, '/models/User': {}, '/models/VivaRound': {}, '/models/VivaParticipantLock': {},
    '/viva': await load('lib/viva.ts'), '/vivaPersistence': {},
  });
  assert.deepEqual(Array.from(await api.getVivaPanelSessions(actor, true), ({ id }) => id), ['006', '007', '008']);
  assert.deepEqual(reads, [6, 6]);
  reads.length = 0;
  assert.equal((await api.getVivaPanelSessions(actor)).length, 44);
  assert.deepEqual(reads, [50]);
});
