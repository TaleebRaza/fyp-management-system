import { getToken, type JWT } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';

type Role = NonNullable<JWT['role']>;

type RequireRoleResult =
  | { kind: 'authorized'; token: JWT }
  | { kind: 'denied'; response: NextResponse };

export async function requireRole(
  req: NextRequest,
  allowedRoles: readonly Role[]
): Promise<RequireRoleResult> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token?.id) {
    return {
      kind: 'denied',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (!token.role || !allowedRoles.includes(token.role)) {
    return {
      kind: 'denied',
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { kind: 'authorized', token };
}
