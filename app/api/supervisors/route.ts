import { NextRequest, NextResponse } from 'next/server';
import { getPublicSupervisors } from '../../../lib/publicContentCache';
import { publicJson } from '../../../lib/publicResponse';
import { getPortalPause } from '../../../lib/portalPause';

export async function GET(req: NextRequest) {
  try {
    const portal = await getPortalPause();
    if (portal.paused) {
      return NextResponse.json({ code: 'PORTAL_PAUSED', error: portal.reason }, { status: 503 });
    }
    return publicJson(req, await getPublicSupervisors());
    
  } catch (error) {
    console.error(
      'API Error [supervisor-fetch]:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return NextResponse.json({ error: 'Failed to fetch supervisors' }, { status: 500 });
  }
}
