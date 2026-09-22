import { NextResponse } from 'next/server';

import { completePasswordReset } from '../../../../lib/auth/passwordResetService';
import { isContentLengthTooLarge } from '../../../../lib/security/request';

export async function POST(req: Request) {
  try {
    if (isContentLengthTooLarge(req, 8 * 1024)) {
      return NextResponse.json({ error: 'Password reset request is too large.' }, { status: 413 });
    }
    const response = await completePasswordReset(await req.json());
    return NextResponse.json(response.body, { status: response.status });
  } catch {
    console.error('password_reset_completion_failed');
    return NextResponse.json({ error: 'Failed to reset password.' }, { status: 500 });
  }
}
