type OriginRequest = Pick<Request, 'headers' | 'method' | 'url'>;

export function isSameOriginMutation(req: OriginRequest) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;

  const origin = req.headers.get('origin');
  const requestUrl = new URL(req.url);
  if (!origin) return false;

  try {
    return new URL(origin).origin === requestUrl.origin;
  } catch {
    return false;
  }
}
