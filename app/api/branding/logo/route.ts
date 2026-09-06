import { NextRequest, NextResponse } from 'next/server';

import { getBrandingLogo } from '../../../../lib/branding';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const logo = await getBrandingLogo();
    if (!logo) return NextResponse.redirect(new URL('/logo.png', req.url), 307);

    return new NextResponse(new Uint8Array(logo), {
      headers: {
        'Cache-Control': 'public, max-age=60, must-revalidate',
        'Content-Disposition': 'inline; filename="university-logo.png"',
        'Content-Length': String(logo.byteLength),
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    console.error('branding_logo_read_failed');
    return NextResponse.json({ error: 'Unable to load university logo.' }, { status: 500 });
  }
}
