import { NextRequest, NextResponse } from 'next/server';
import {
  buildProjectRatingsExportFilter,
  buildProjectRatingsExportRows,
  getProjectRatingsExportFilename,
  getProjectRatingsExportUserIds,
  parseProjectRatingsExportFilters,
  type ProjectRatingsExportProject,
  type ProjectRatingsExportUser,
} from '../../../../lib/projectRatingsExport';
import { requireCurrentUser } from '../../../../lib/security/auth';
import Project from '../../../../models/Project';
import User from '../../../../models/User';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }
  const filters = parseProjectRatingsExportFilters(req.nextUrl.searchParams);
  if (!filters) {
    return NextResponse.json(
      { error: 'Choose Proposal or Thesis and use whole-number minimums from 0 through 10.' },
      { status: 400 }
    );
  }

  try {
    const projects = await Project.find(buildProjectRatingsExportFilter(filters))
      .select(`_id title domains domain stage status supervisorId members ratings.${filters.round}`)
      .lean<ProjectRatingsExportProject[]>();
    const relatedUserIds = getProjectRatingsExportUserIds(projects, filters.round);
    const users = relatedUserIds.length > 0
      ? await User.find({ _id: { $in: relatedUserIds } })
          .select('_id role name email rollNo program batch semester')
          .lean<ProjectRatingsExportUser[]>()
      : [];
    const rows = buildProjectRatingsExportRows(projects, users, filters.round);

    return NextResponse.json(
      {
        rows,
        filename: getProjectRatingsExportFilename(filters.round),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
  } catch (error) {
    console.error('Project ratings export error:', error);
    return NextResponse.json(
      { error: 'Failed to generate the project ratings export.' },
      { status: 500 }
    );
  }
}
