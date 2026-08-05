import { NextRequest, NextResponse } from 'next/server';
import { AcademicResetError, resetStudentAcademicInfo } from '../../../../lib/academicReset';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { recordPortalActivity } from '../../../../lib/portalActivityLog';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['admin']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const { targetUserId, newBatch } = await req.json();

    const result = await resetStudentAcademicInfo({
      targetUserId,
      newBatch,
      actor: 'admin',
      enforceStudentCooldown: false,
    });

    await recordPortalActivity({
      action: 'admin-student-updated',
      actorId: currentUser.id,
      actorRole: currentUser.role,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('Update Batch Error:', error);

    if (error instanceof AcademicResetError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ error: 'Failed to update batch.' }, { status: 500 });
  }
}
