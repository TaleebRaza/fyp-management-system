import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const ADMIN_ROUTES = [
  "/api/admin",
  "/api/add-supervisor",
  "/api/delete-supervisor",
  "/api/supervisors/toggle-notifications",
];

const SUPERVISOR_ROUTES = [
  "/api/dashboard/supervisor",
  "/api/export-pdf",
];

const STUDENT_ROUTES = [
  "/api/dashboard/student",
  "/api/project/join",
  "/api/upload",
];

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    const isAdminRoute = ADMIN_ROUTES.some(route => path.startsWith(route));
    if (isAdminRoute && role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Admin privileges required." },
        { status: 403 }
      );
    }

    const isSupervisorRoute = SUPERVISOR_ROUTES.some(route => path.startsWith(route));
    if (isSupervisorRoute && role !== "supervisor" && role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Supervisor privileges required." },
        { status: 403 }
      );
    }

    const isStudentRoute = STUDENT_ROUTES.some(route => path.startsWith(route));
    if (isStudentRoute && role !== "student" && role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Student privileges required." },
        { status: 403 }
      );
    }

    return NextResponse.next();
  },
  { callbacks: { authorized: ({ token }) => !!token } }
);

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/add-supervisor",
    "/api/delete-supervisor",
    "/api/supervisors/toggle-notifications",
    "/api/dashboard/supervisor",
    "/api/export-pdf",
    "/api/dashboard/student",
    "/api/project/join",
    "/api/upload"
  ],
};
