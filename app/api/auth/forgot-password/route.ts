import { NextResponse } from 'next/server';

import { verifyPasswordResetKnowledge } from '../../../../lib/auth/passwordResetService';

export async function POST(req: Request) {
  try {
    const response = await verifyPasswordResetKnowledge(await req.json());
    return NextResponse.json(response.body, { status: response.status });
  } catch {
    console.error('password_reset_verification_failed');
    return NextResponse.json({ error: 'Failed to verify account details.' }, { status: 500 });
  }
}
