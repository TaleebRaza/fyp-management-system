import { NextRequest, NextResponse } from 'next/server';
import { AcademicResetError, resetStudentAcademicInfo } from '../../../../lib/academicReset';
import { requireCurrentUser } from '../../../../lib/security/auth';
import { JSON_BODY_LIMITS, readBoundedJson } from '../../../../lib/security/request';
import { recordPortalActivity } from '../../../../lib/portalActivityLog';

export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireCurrentUser(req, ['admin']);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
    }

    const json = await readBoundedJson(req, JSON_BODY_LIMITS.control);
    if (!json.ok) return json.response;
    const { targetUserId, newBatch } = json.value as { targetUserId: string; newBatch: string };

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
