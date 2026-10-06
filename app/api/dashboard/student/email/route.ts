import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '../../../../../lib/security/auth';
import { readBoundedJson } from '../../../../../lib/security/request';
import { updateStudentEmail } from '../../../../../lib/auth/studentEmailChange';

export async function POST(req: NextRequest) {
  try {
    const student = await requireCurrentUser(req, ['student']);
    if (!student) return NextResponse.json({ error: 'Unauthorized student request.' }, { status: 401 });
    const parsed = await readBoundedJson(req, 8 * 1024);
    if (!parsed.ok) return parsed.response;
    const response = await updateStudentEmail(student.id, parsed.value, req.headers);
    return NextResponse.json(response.body, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('student_email_change_failed');
    return NextResponse.json({ error: 'Unable to change email.' }, { status: 500 });
  }
}
