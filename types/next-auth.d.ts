import type { DefaultSession, DefaultUser } from 'next-auth';

declare module 'next-auth' {
  interface User extends DefaultUser {
    role: string;
    rollNo: string;
  }

  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      role: string;
      rollNo: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    rollNo?: string;
  }
}
