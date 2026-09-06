import { NextRequest, NextResponse } from 'next/server';

import { getPublicBranding } from '../../../lib/publicContentCache';
import { publicJson } from '../../../lib/publicResponse';

export async function GET(req: NextRequest) {
  try {
    return publicJson(req, await getPublicBranding());
  } catch {
    console.error('branding_read_failed');
    return NextResponse.json({ error: 'Unable to load portal branding.' }, { status: 500 });
  }
}
