import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

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

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    if (ADMIN_ROUTES.some((route) => path.startsWith(route)) && role !== 'admin') {
      return NextResponse.json(
        { error: 'Security Checkpoint: Access Denied. Admin privileges required.' },
        { status: 403 }
      );
    }

    if (SUPERVISOR_ROUTES.some((route) => path.startsWith(route)) && role !== 'supervisor' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Security Checkpoint: Access Denied. Supervisor privileges required.' },
        { status: 403 }
      );
    }

    if (STUDENT_ROUTES.some((route) => path.startsWith(route)) && role !== 'student' && role !== 'admin') {
      return NextResponse.json(
        { error: 'Security Checkpoint: Access Denied. Student privileges required.' },
        { status: 403 }
      );
    }

    if (AUTHENTICATED_ROUTES.some((route) => path.startsWith(route)) && !role) {
      return NextResponse.json({ error: 'Security Checkpoint: Sign in required.' }, { status: 401 });
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    '/api/admin/:path*',
    '/api/add-supervisor',
    '/api/delete-supervisor',
    '/api/supervisors/toggle-notifications',
    '/api/dashboard/supervisor',
    '/api/export-pdf',
    '/api/dashboard/student',
    '/api/project/join',
    '/api/project/leave',
    '/api/upload',
    '/api/read-pdf',
    '/api/templates',
    '/api/voice/:path*',
  ],
};
