type OriginRequest = Pick<Request, 'headers' | 'method' | 'url'>;

export function isSameOriginMutation(req: OriginRequest) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;

  const origin = req.headers.get('origin');
  const requestUrl = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || requestUrl.host;
  const protocol = req.headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '');

  if (!origin || !host) return false;

  try {
    return new URL(origin).origin === `${protocol}://${host}`;
  } catch {
    return false;
  }
}
