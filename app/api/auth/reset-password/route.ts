import { NextResponse } from 'next/server';

import { completePasswordReset } from '../../../../lib/auth/passwordResetService';

export async function POST(req: Request) {
  try {
    const response = await completePasswordReset(await req.json());
    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    console.error('Password reset error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 });
  }
}
