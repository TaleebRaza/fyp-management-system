import { NextResponse } from 'next/server';
import { requestPasswordReset } from '../../../../lib/auth/passwordResetService';
import { readBoundedJson } from '../../../../lib/security/request';

export async function POST(req: Request) {
  try {
    const parsed = await readBoundedJson(req, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const response = await requestPasswordReset(parsed.value, req.headers);
    return NextResponse.json(response.body, { status: response.status });
  } catch {
    console.error('password_reset_request_failed');
    return NextResponse.json({ error: 'Unable to request a reset code.' }, { status: 500 });
  }
}
