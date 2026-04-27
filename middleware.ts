import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // 1. Protect Admin-Only Routes
    const isAdminRoute = 
      path.startsWith("/api/admin") ||
      path.startsWith("/api/add-supervisor") ||
      path.startsWith("/api/delete-supervisor") ||
      path.startsWith("/api/supervisors/toggle-notifications");

    if (isAdminRoute && token?.role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Admin privileges required." }, 
        { status: 403 }
      );
    }

    // 2. Protect Supervisor-Only Routes (including PDF exports)
    const isSupervisorRoute = 
      path.startsWith("/api/dashboard/supervisor") ||
      path.startsWith("/api/export-pdf");

    if (isSupervisorRoute && token?.role !== "supervisor" && token?.role !== "admin") {
      return NextResponse.json(
        { error: "Security Checkpoint: Access Denied. Supervisor privileges required." }, 
        { status: 403 }
      );
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // This ensures the middleware only processes requests that have a valid NextAuth token.
      // Unauthenticated users will be rejected immediately.
      authorized: ({ token }) => !!token,
    },
  }
);

// Define exactly which routes this middleware should intercept to maintain high performance
export const config = {
  matcher: [
    "/api/admin/:path*",
    "/api/add-supervisor",
    "/api/delete-supervisor",
    "/api/supervisors/toggle-notifications",
    "/api/dashboard/supervisor",
    "/api/export-pdf"
  ],
};