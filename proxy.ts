import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { createContentSecurityPolicy } from './lib/contentSecurityPolicy';

const ADMIN_ROUTES = [
  '/api/admin',
  '/api/add-supervisor',
  '/api/delete-supervisor',
  '/api/supervisors/toggle-notifications',
];

const SUPERVISOR_ROUTES = [
  '/api/dashboard/supervisor',
  '/api/export-pdf',
];

const AUTHENTICATED_ROUTES = [
  '/api/voice',
  '/api/read-pdf',
  '/api/templates',
];

const STUDENT_ROUTES = [
  '/api/dashboard/student',
  '/api/project/join',
  '/api/project/leave',
  '/api/upload',
];

const PROTECTED_ROUTES = [
  ...ADMIN_ROUTES,
  ...SUPERVISOR_ROUTES,
  ...AUTHENTICATED_ROUTES,
  ...STUDENT_ROUTES,
];

const PROTECTED_ROUTE_PREFIXES = new Set(['/api/admin', '/api/voice']);

function matchesProtectedRoute(path: string, route: string): boolean {
  return path === route || (
    PROTECTED_ROUTE_PREFIXES.has(route) && path.startsWith(`${route}/`)
  );
}

function isProtectedRoute(path: string): boolean {
  return PROTECTED_ROUTES.some((route) => matchesProtectedRoute(path, route));
}

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    if (ADMIN_ROUTES.some((route) => matchesProtectedRoute(path, route)) && role !== 'admin') {
      return NextResponse.json(
        { error: 'Security Checkpoint: Access Denied. Admin privileges required.' },
        { status: 403 }
      );
    }

    if (SUPERVISOR_ROUTES.some((route) => matchesProtectedRoute(path, route)) && role !== 'supervisor' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Security Checkpoint: Access Denied. Supervisor privileges required.' },
        { status: 403 }
      );
    }

    if (STUDENT_ROUTES.some((route) => matchesProtectedRoute(path, route)) && role !== 'student' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Security Checkpoint: Access Denied. Student privileges required.' },
        { status: 403 }
      );
    }

    if (AUTHENTICATED_ROUTES.some((route) => matchesProtectedRoute(path, route)) && !role) {
      return NextResponse.json({ error: 'Security Checkpoint: Sign in required.' }, { status: 401 });
    }

    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const contentSecurityPolicy = createContentSecurityPolicy(
      nonce,
      process.env.NODE_ENV === 'development'
    );
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Content-Security-Policy', contentSecurityPolicy);
    return response;
  },
  {
    callbacks: {
      authorized: ({ req, token }) => !isProtectedRoute(req.nextUrl.pathname) || !!token,
    },
  }
);

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
