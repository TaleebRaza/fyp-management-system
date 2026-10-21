import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../app/api/admin/project-reviews/route.ts', import.meta.url), 'utf8');
const patchSource = ts.transpileModule(source.slice(source.indexOf('export async function PATCH')), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace('export ', '');

async function update(body, initial) {
  let stored = { ...initial };
  let writes = 0;
  const dependencies = {
    requireCurrentUser: async () => ({ id: 'admin', role: 'admin' }),
    readBoundedJson: async () => ({ ok: true, value: body }),
    JSON_BODY_LIMITS: { control: 1024 },
    isRecord: (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
    NextResponse: { json: (data, options) => ({ data, status: options?.status ?? 200 }) },
    connectToDatabase: async () => {},
    RegistrationPolicy: { findOneAndUpdate: async (_filter, change) => {
      writes++;
      stored = { ...stored, ...change.$set };
      return stored;
    } },
    REGISTRATION_POLICY_KEY: 'student-registration',
    serializeRegistrationPolicy: (policy) => policy,
    invalidatePublicContent: () => {},
    PUBLIC_REGISTRATION_POLICY_TAG: 'policy',
    recordPortalActivity: async () => {},
  };
  const patch = new Function(...Object.keys(dependencies), `${patchSource}; return PATCH;`)(...Object.values(dependencies));
  return { response: await patch({}), get stored() { return stored; }, get writes() { return writes; } };
}

test('admin changes either project control without changing the other, in all four states', async () => {
  for (const submissions of [true, false]) {
    for (const reset of [true, false]) {
      const initial = { projectSubmissionsOpen: submissions, projectResetEnabled: reset };
      for (const key of Object.keys(initial)) {
        const result = await update({ [key]: !initial[key] }, initial);
        assert.equal(result.response.status, 200);
        assert.equal(result.writes, 1);
        for (const field of Object.keys(initial)) {
          assert.equal(result.stored[field], field === key ? !initial[field] : initial[field]);
          assert.equal(result.response.data[field], result.stored[field]);
        }
      }
    }
  }
});

test('admin project controls reject missing or non-boolean settings without writes', async () => {
  for (const body of [null, {}, { projectResetEnabled: 'false' }, { projectSubmissionsOpen: false, projectResetEnabled: null }]) {
    const result = await update(body, {});
    assert.equal(result.response.status, 400);
    assert.equal(result.writes, 0);
  }
});
