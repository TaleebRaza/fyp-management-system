import { NextRequest, NextResponse } from 'next/server';
import { createPublicEtag } from './publicEtag';

const PUBLIC_CACHE_CONTROL = 'public, max-age=60, must-revalidate';

export function publicJson(request: NextRequest, body: unknown) {
  const etag = createPublicEtag(body);
  const headers = {
    'Cache-Control': PUBLIC_CACHE_CONTROL,
    ETag: etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers });
  }

  return NextResponse.json(body, { headers });
}
