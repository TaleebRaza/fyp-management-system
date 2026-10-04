import { NextRequest, NextResponse } from 'next/server';

import { REVIEWED_PROJECT_STATUSES } from '../../../../lib/projectReviewPolicy';
import { requireCurrentUser } from '../../../../lib/security/auth';
import Project from '../../../../models/Project';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const [students, supervisors, projects, reviewQueue] = await Promise.all([
      User.countDocuments({ role: 'student', isActive: { $ne: false } }),
      User.countDocuments({ role: 'supervisor' }),
      Project.countDocuments(),
      Project.countDocuments({
        pdfUrl: { $type: 'string', $ne: '' },
        status: { $nin: REVIEWED_PROJECT_STATUSES },
      }),
    ]);

    return NextResponse.json(
      { students, supervisors, projects, reviewQueue },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json({ error: 'Failed to fetch the admin overview.' }, { status: 500 });
  }
}
