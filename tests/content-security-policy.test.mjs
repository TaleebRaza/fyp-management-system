import assert from 'node:assert/strict';
import test from 'node:test';
import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { createContentSecurityPolicy } = await importTypeScriptModule('lib/contentSecurityPolicy.ts');

test('production CSP permits only nonced application scripts', () => {
  const policy = createContentSecurityPolicy('test-nonce', false);

  assert.match(policy, /script-src 'self' 'nonce-test-nonce' 'strict-dynamic'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(policy, /script-src[^;]*'unsafe-eval'/);
  assert.doesNotMatch(policy, /script-src[^;]*https:/);
});

test('development CSP retains eval support for the React debugging runtime', () => {
  const policy = createContentSecurityPolicy('test-nonce', true);

  assert.match(policy, /script-src[^;]*'unsafe-eval'/);
});
