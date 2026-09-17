import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('portal pause is server-enforced and keeps only admin access', async () => {
  const [proxy, auth, adminRoute, login] = await Promise.all([
    readFile(new URL('../proxy.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/auth/[...nextauth]/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin/portal-status/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../components/auth/LoginView.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(proxy, /shouldEnforcePortalPause\(path, role\)/);
  assert.match(proxy, /path\.startsWith\('\/api\/'\)[\s\S]*path !== '\/api\/portal-status'[\s\S]*!isRequiredAuthRoute[\s\S]*role !== 'admin'/);
  assert.match(proxy, /PORTAL_UNAVAILABLE/);
  assert.match(auth, /portal\.paused && user\.role !== 'admin'/);
  assert.match(adminRoute, /requireCurrentUser\(req, \['admin'\]\)/);
  assert.match(login, /Administrator access only/);
  assert.match(login, /!portalPaused && <div/);
});
