import ExcelJS from 'exceljs';
import { NextRequest, NextResponse } from 'next/server';

import {
  buildProjectRatingsExportFilter,
  buildProjectRatingsExportRows,
  getProjectRatingsExportFilename,
  getProjectRatingsExportUserIds,
  parseProjectRatingsExportFilters,
  populateProjectRatingsWorkbook,
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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FYP Portal';
    workbook.created = new Date();
    populateProjectRatingsWorkbook(workbook, rows);
    // ponytail: Keep this in memory while the portal dataset is small. Stream or queue it
    // if production exports approach the hosting provider's function payload limit.
    const buffer = await workbook.xlsx.writeBuffer();
    const body = new Uint8Array(buffer);

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${getProjectRatingsExportFilename(filters.round)}"`,
        'Content-Length': body.byteLength.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('Project ratings export error:', error);
    return NextResponse.json({ error: 'Failed to generate the project ratings export.' }, { status: 500 });
  }
}
