import { NextRequest, NextResponse } from 'next/server';

import { requireCurrentUser } from '../../../../lib/security/auth';
import Project from '../../../../models/Project';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const [studentCounts, supervisors, projects, reviewQueue] = await Promise.all([
      User.aggregate<{ total: number; active: number }>([
        { $match: { role: 'student' } },
        { $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$isActive', false] }, 0, 1] } },
        } },
      ]),
      User.countDocuments({ role: 'supervisor' }),
      Project.countDocuments(),
      Project.countDocuments({
        pdfUrl: { $type: 'string', $ne: '' },
        status: 'Submitted For Review',
      }),
    ]);

    return NextResponse.json(
      { students: studentCounts[0]?.active || 0, totalStudents: studentCounts[0]?.total || 0, supervisors, projects, reviewQueue },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Admin overview error:', error);
    return NextResponse.json({ error: 'Failed to fetch the admin overview.' }, { status: 500 });
  }
}
