import { createHash } from 'node:crypto';

const PUBLIC_CACHE_CONTROL = 'public, max-age=60, must-revalidate';

type PublicRequest = Pick<Request, 'headers'>;

export function createPublicEtag(body: unknown) {
  return `"${createHash('sha256').update(JSON.stringify(body)).digest('base64url')}"`;
}

export function publicJson(request: PublicRequest, body: unknown) {
  const etag = createPublicEtag(body);
  const headers = {
    'Cache-Control': PUBLIC_CACHE_CONTROL,
    ETag: etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers });
  }

  return Response.json(body, { headers });
}
