import { NextResponse } from 'next/server';
import { verifyPasswordResetOtp } from '../../../../lib/auth/passwordResetService';
import { readBoundedJson } from '../../../../lib/security/request';

export async function POST(req: Request) {
  try {
    const parsed = await readBoundedJson(req, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const response = await verifyPasswordResetOtp(parsed.value, req.headers);
    return NextResponse.json(response.body, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('password_reset_otp_verification_failed');
    return NextResponse.json({ error: 'Unable to verify the reset code.' }, { status: 500 });
  }
}
