import { subscribe } from 'node:diagnostics_channel';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { testTimings } from './testTimings';

const routes = new Set([
  '/', '/api/auth/csrf', '/api/auth/session', '/api/auth/signout', '/api/auth/callback/credentials',
  '/api/auth/forgot-password', '/api/auth/verify-reset-otp', '/api/auth/reset-password',
  '/api/register', '/api/headline', '/api/upload', '/api/read-pdf', '/api/supervisors', '/api/portal-status',
  '/api/registration-policy', '/api/dashboard/student', '/api/dashboard/supervisor',
  '/api/admin/summary', '/api/admin/project-reviews', '/api/admin/viva',
]);

export function registerTestTimings() {
  subscribe('http.server.request.start', data => {
    const { request, response } = data as { request: IncomingMessage; response: ServerResponse };
    const route = request.url?.split('?', 1)[0] || '';
    if (!routes.has(route)) return;
    const started = performance.now();
    const timings = {
      mongo: { count: 0, ms: 0 }, storage: { count: 0, ms: 0 }, smtp: { count: 0, ms: 0 },
    };
    testTimings.enterWith(timings);
    response.once('finish', () => {
      console.info('fyp_test_timing ' + JSON.stringify({
        timestamp: new Date().toISOString(), method: request.method, route, status: response.statusCode,
        ms: performance.now() - started, ...timings,
      }));
    });
  });
}
