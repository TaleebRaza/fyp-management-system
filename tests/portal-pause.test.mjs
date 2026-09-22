import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('portal pause is server-enforced and keeps only admin access', async () => {
  const [proxy, auth, authGuard, registerRoute, adminRoute, login] = await Promise.all([
    readFile(new URL('../proxy.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/[...nextauth]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../lib/security/auth.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/register/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/portal-status/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/auth/LoginView.tsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(proxy, /fetch\(new URL\('\/api\/portal-status'/);
  assert.match(authGuard, /currentUser\.role !== 'admin' && \(await getPortalPause\(\)\)\.paused/);
  assert.match(registerRoute, /code: 'PORTAL_PAUSED'/);
  assert.match(auth, /portal\.paused && user\.role !== 'admin'/);
  assert.match(adminRoute, /requireCurrentUser\(req, \['admin'\]\)/);
  assert.match(login, /Administrator access only/);
  assert.match(login, /!portalPaused && <div/);
});
