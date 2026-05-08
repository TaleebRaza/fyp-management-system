import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// ✅ Defined outside function = created once, saving memory on every request
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
  "/api/upload", // Secures the Vercel Blob from public abuse
];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const role = token?.role;

    // 1. Protect Admin-Only Routes
    const isAdminRoute = ADMIN_ROUTES.some(route => path.startsWith(route));
    if (isAdminRoute && role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Admin privileges required." },
        { status: 403 }
      );
    }

    // 2. Protect Supervisor-Only Routes
    const isSupervisorRoute = SUPERVISOR_ROUTES.some(route => path.startsWith(route));
    if (isSupervisorRoute && role !== "supervisor" && role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Supervisor privileges required." },
        { status: 403 }
      );
    }

    // 3. Protect Student-Only Routes (Prevents public internet abuse)
    const isStudentRoute = STUDENT_ROUTES.some(route => path.startsWith(route));
    if (isStudentRoute && role !== "student" && role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Student privileges required." },
        { status: 403 }
      );
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Require a valid token for any route that the middleware matcher catches
      authorized: ({ token }) => !!token,
    },
  }
);

// The matcher tells Next.js exactly which routes should go through this firewall
export const config = {
  matcher: [
    /* Admin Routes */
    "/api/admin/:path*",
    "/api/add-supervisor",
    "/api/delete-supervisor",
    "/api/supervisors/toggle-notifications",
    
    /* Supervisor Routes */
    "/api/dashboard/supervisor",
    "/api/export-pdf",

    /* Student & File Routes (Newly Secured) */
    "/api/dashboard/student",
    "/api/project/join",
    "/api/upload"
  ],
};