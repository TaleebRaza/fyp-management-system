import type { DefaultSession } from 'next-auth';

type UserRole = 'admin' | 'supervisor' | 'student';

declare module 'next-auth' {
  interface Session {
    user?: {
      id?: string;
      role?: UserRole;
      rollNo?: string;
    } & DefaultSession['user'];
  }

  interface User {
    role: UserRole;
    rollNo: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: UserRole;
    rollNo?: string;
  }
}
