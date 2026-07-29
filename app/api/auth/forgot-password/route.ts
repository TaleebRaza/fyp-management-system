import { NextResponse } from 'next/server';

import { verifyPasswordResetKnowledge } from '../../../../lib/auth/passwordResetService';

export async function POST(req: Request) {
  try {
    const response = await verifyPasswordResetKnowledge(await req.json());
    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    console.error('Forgot Password Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to verify account details.' }, { status: 500 });
  }
}
