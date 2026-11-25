import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModuleWithDependencies } from './support/importTypeScript.mjs';

const { createWorkAdmission, WorkBusyError } = await importTypeScriptModuleWithDependencies('lib/workAdmission.ts');

test('a full queue rejects overflow and hands the slot to the waiting request', async () => {
  const acquire = createWorkAdmission(1, 1);
  const release = await acquire();
  const waiting = acquire();
  await assert.rejects(acquire(), WorkBusyError);
  release();
  const releaseNext = await waiting;
  releaseNext();
});

test('an expired waiter cannot consume the next available slot', async () => {
  const acquire = createWorkAdmission(1, 1, 5);
  const release = await acquire();
  await assert.rejects(acquire(), WorkBusyError);
  release();
  const releaseNext = await acquire();
  releaseNext();
});
