import { NextRequest, NextResponse } from 'next/server';
import { AcademicResetError, resetStudentAcademicInfo } from '../../../../lib/academicReset';
import { requireCurrentUser } from '../../../../lib/security/auth';

export async function POST(req: NextRequest) {
  try {
    if (!await requireCurrentUser(req, ['admin'])) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const { targetUserId, newProgram } = await req.json();

    const result = await resetStudentAcademicInfo({
      targetUserId,
      newProgram,
      actor: 'admin',
      enforceStudentCooldown: false,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Update Program Error:', error);

    if (error instanceof AcademicResetError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ error: 'Failed to update program.' }, { status: 500 });
  }
}
