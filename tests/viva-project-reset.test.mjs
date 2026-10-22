import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function load(path, modules) {
  const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
  const exports = {};
  vm.runInNewContext(outputText, { exports, require(name) {
    const entry = Object.entries(modules).find(([suffix]) => name.endsWith(suffix));
    assert.ok(entry, `Unexpected import: ${name}`);
    return entry[1];
  } });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const query = (value) => ({ session: async () => value });

function fixture() {
  const writes = [];
  const state = {
    projects: [{ _id: 'p1', pdfUrl: 'projects/current.pdf', pdfSize: 20 }],
    sessions: [{ _id: 's1', projectId: 'p1', startedAt: new Date(), completedAt: new Date(), projectSnapshot: { pdfUrl: 'projects/history.pdf', pdfSize: 10 } }],
  };
  class StorageProtocolError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; } }
  const mutation = (kind) => async (...args) => { writes.push([kind, ...plain(args)]); };
  const modules = {
    mongoose: { Types: { ObjectId: { isValid: (id) => id === 'r1' } } },
    '/mongodb': async () => {},
    '/models/Project': { find: () => query(state.projects), updateMany: mutation('projects') },
    '/models/VivaRound': { findById: () => query({ projectIds: ['p1'] }), updateMany: mutation('rounds') },
    '/models/VivaSession': { find: () => query(state.sessions), deleteMany: mutation('sessions') },
    '/models/VivaAuditEvent': { deleteMany: mutation('audit') },
    '/models/VivaParticipantLock': { deleteMany: mutation('locks') },
    '/storageProtocol': {
      StorageProtocolError, withStorageTransaction: (callback) => callback('transaction'),
      assertStorageLedgerReady: async () => {}, enqueueStorageDeletion: mutation('file'),
    },
    '/storageValidation': { normalizeStorageKey: (key) => key.startsWith('projects/') ? key : null },
    '/storageDeletionTargets': { collectStorageDeletionTargets: (files) => files.filter(({ key }) => key) },
    '/storageReferenceSafety': { findSharedStorageKeys: async () => new Set() },
  };
  return { state, writes, modules };
}

test('reset clears selected teams across rounds and queues current and historic documents in the transaction', async () => {
  const { writes, modules } = fixture();
  const { resetVivaProjects } = await load('lib/vivaProjectReset.ts', modules);
  assert.deepEqual(plain(await resetVivaProjects('r1')), { resetProjects: 1 });
  const find = (kind) => writes.find(([name]) => name === kind);
  assert.deepEqual(find('sessions')[1], { _id: { $in: ['s1'] } });
  assert.deepEqual(find('audit')[1], { sessionId: { $in: ['s1'] } });
  assert.deepEqual(find('locks')[1], { sessionId: { $in: ['s1'] } });
  assert.deepEqual(find('projects')[1], { _id: { $in: ['p1'] } });
  assert.deepEqual(find('projects')[2], {
    $set: { stage: 'PROPOSAL', status: 'Pending', reviewRemarks: '', pdfUrl: '', pdfSize: 0 },
    $unset: { ratings: 1 }, $inc: { version: 1 },
  });
  assert.deepEqual(find('rounds')[1], { projectIds: { $in: ['p1'] } });
  assert.deepEqual(find('rounds')[2].$pull, { projectIds: { $in: ['p1'] }, heldProjectIds: { $in: ['p1'] } });
  assert.deepEqual(writes.filter(([kind]) => kind === 'file').map(([, file]) => file.key), ['projects/current.pdf', 'projects/history.pdf']);
  for (const [kind, ...args] of writes) assert.deepEqual(args.at(-1), kind === 'file' ? 'transaction' : { session: 'transaction' });
});

test('reset rejects invalid input, active sessions and invalid storage keys before deleting anything', async () => {
  for (const scenario of ['invalid-id', 'active', 'invalid-key']) {
    const { state, writes, modules } = fixture();
    if (scenario === 'active') state.sessions[0].completedAt = null;
    if (scenario === 'invalid-key') state.projects[0].pdfUrl = 'invalid';
    const { resetVivaProjects } = await load('lib/vivaProjectReset.ts', modules);
    await assert.rejects(resetVivaProjects(scenario === 'invalid-id' ? 'bad' : 'r1'), (error) => error.statusCode === (scenario === 'invalid-id' ? 400 : 409));
    assert.equal(writes.length, 0);
  }
});

test('reset preserves documents referenced by unrelated projects or sessions', async () => {
  const { writes, modules } = fixture();
  modules['/storageReferenceSafety'].findSharedStorageKeys = async () => new Set(['projects/history.pdf']);
  const { resetVivaProjects } = await load('lib/vivaProjectReset.ts', modules);
  await resetVivaProjects('r1');
  assert.deepEqual(writes.filter(([kind]) => kind === 'file').map(([, file]) => file.key), ['projects/current.pdf']);
});

test('the project lock follows saved grades and clears when the grade session is removed', async () => {
  let saved = false;
  let observed;
  const { isProjectGraded } = await load('lib/gradedProject.ts', {
    '/models/VivaSession': { exists: (filter) => {
      observed = plain(filter);
      return { session: async (session) => { assert.equal(session, 'transaction'); return saved ? { _id: 's1' } : null; } };
    } },
  });
  assert.equal(await isProjectGraded(null), false);
  assert.equal(await isProjectGraded('p1', 'transaction'), false);
  saved = true;
  assert.equal(await isProjectGraded('p1', 'transaction'), true);
  assert.deepEqual(observed, { projectId: 'p1', cancelledAt: null, 'result.selectedAt': { $type: 'date' } });
  saved = false;
  assert.equal(await isProjectGraded('p1', 'transaction'), false);
});
