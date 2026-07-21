import { NextRequest, NextResponse } from 'next/server';

import connectToDatabase from '../../../../lib/mongodb';
import { reconcileProjectData } from '../../../../lib/projectDataReconciliation';
import { requireRole } from '../../../../lib/routeAuth';
import Project from '../../../../models/Project';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authorization = await requireRole(req, ['admin']);
  if (authorization.kind === 'denied') return authorization.response;

  try {
    await connectToDatabase();

    const [students, projects] = await Promise.all([
      User.find({ role: 'student' })
        .select('_id projectId supervisorId status projectTitle domain domains pdfUrl')
        .lean(),
      Project.find({})
        .select('_id members supervisorId status title domain domains pdfUrl')
        .lean(),
    ]);

    return NextResponse.json(reconcileProjectData(students, projects));
  } catch (error) {
    console.error('Project data reconciliation failed:', error);
    return NextResponse.json({ error: 'Failed to reconcile project data.' }, { status: 500 });
  }
}
