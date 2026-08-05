import { NextRequest, NextResponse } from 'next/server';

import { getPortalActivityPage } from '../../../../lib/portalActivityLog';
import { requireCurrentUser } from '../../../../lib/security/auth';

export const dynamic = 'force-dynamic';

function parsePage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export async function GET(req: NextRequest) {
  if (!await requireCurrentUser(req, ['admin'])) {
    return NextResponse.json({ error: 'Unauthorized admin request.' }, { status: 401 });
  }

  try {
    const data = await getPortalActivityPage(parsePage(req.nextUrl.searchParams.get('page')));
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    console.error('portal_activity_log_read_failed');
    return NextResponse.json({ error: 'Failed to fetch activity logs.' }, { status: 500 });
  }
}
