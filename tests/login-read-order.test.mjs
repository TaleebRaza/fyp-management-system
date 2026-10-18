import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

test('locked logins never read credentials, verify passwords or run the legacy scan', async () => {
  const source = await readFile(new URL('../app/api/auth/[...nextauth]/route.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  let options;
  let finishLimits;
  let lookups = 0;
  let verifications = 0;
  const limits = new Promise((resolve) => { finishLimits = resolve; });
  const modules = {
    'next-auth': (config) => { options = config; return () => {}; },
    'next-auth/providers/credentials': (config) => config,
    '../../../../lib/mongodb': async () => {},
    '../../../../models/User': { findOne: () => {
      lookups++;
      const query = { select: () => query, lean: () => query, exec: async () => null, then: (resolve) => Promise.resolve(null).then(resolve) };
      return query;
    } },
    '../../../../lib/rollNo': { normalizeRollNo: (value) => value.trim().toUpperCase(), buildRollNoRegex: () => /legacy/ },
    '../../../../lib/security/password': { verifyPassword: async () => { verifications++; return { matches: false }; } },
    '../../../../lib/rateLimit': {
      hashRateLimitIdentifier: (value) => value,
      getTrustedClientIp: () => '127.0.0.1',
      getLoginRateLimitStatus: () => limits,
    },
    '../../../../lib/portalActivityLog': {},
    '../../../../lib/portalPause': { getPortalPause: async () => ({ paused: false }) },
    '../../../../lib/vivaAccessRestriction': {},
  };
  vm.runInNewContext(code, {
    exports: {}, performance, process, console, Headers,
    require: (name) => { assert.ok(name in modules, `Unexpected import ${name}`); return modules[name]; },
  });
  const pending = options.providers[0].authorize({ rollNo: 'TEST', password: 'test-password' }, { headers: {} });
  const rejected = assert.rejects(pending, /Too many login attempts/);
  await new Promise(setImmediate);
  const lookupsWhileLimitPending = lookups;
  assert.equal(verifications, 0);
  finishLimits({ accountExceeded: true, ipExceeded: false });
  await rejected;
  assert.equal(lookupsWhileLimitPending, 0, 'credential reads must wait for throttling');
  assert.equal(lookups, 0, 'locked requests must not read credentials or run the legacy scan');
  assert.equal(verifications, 0, 'locked requests must not perform password work');
});
