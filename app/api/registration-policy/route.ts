import { NextRequest, NextResponse } from 'next/server';
import { getPublicRegistrationPolicy } from '../../../lib/publicContentCache';
import { publicJson } from '../../../lib/publicResponse';
import { getPortalPause } from '../../../lib/portalPause';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const portal = await getPortalPause();
    if (portal.paused) {
      return NextResponse.json({ code: 'PORTAL_PAUSED', error: portal.reason }, { status: 503 });
    }
    return publicJson(req, await getPublicRegistrationPolicy());
  } catch (error) {
    console.error('Registration policy read error:', error);
    return NextResponse.json(
      { error: 'Unable to load the registration policy.' },
      { status: 500 }
    );
  }
}
