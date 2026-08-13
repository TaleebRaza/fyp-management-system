import { NextResponse } from 'next/server';
import { getPortalPause } from '../../../lib/portalPause';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getPortalPause(), {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Portal status read error:', error);
    return NextResponse.json(
      { error: 'Unable to verify portal availability.' },
      { status: 500 }
    );
  }
}
