import assert from 'node:assert/strict';
import test from 'node:test';

import { importTypeScriptModule } from './support/importTypeScript.mjs';

const { isSameOriginMutation } = await importTypeScriptModule('lib/security/origin.ts');

test('cookie-authenticated mutations require the request origin to match the portal', () => {
  assert.equal(
    isSameOriginMutation(new Request('https://portal.example/api/action', {
      method: 'POST',
      headers: { origin: 'https://portal.example' },
    })),
    true
  );
  assert.equal(
    isSameOriginMutation(new Request('https://portal.example/api/action', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    })),
    false
  );
  assert.equal(
    isSameOriginMutation(new Request('https://portal.example/api/action', { method: 'GET' })),
    true
  );
  assert.equal(
    isSameOriginMutation(new Request('https://portal.example/api/action', {
      method: 'PATCH',
      headers: {
        origin: 'https://evil.example',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'https',
      },
    })),
    false
  );
  assert.equal(
    isSameOriginMutation(new Request('https://portal.example/api/action', {
      method: 'DELETE',
      headers: { origin: 'not a url' },
    })),
    false
  );
});
