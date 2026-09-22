import type { ErrorEvent } from '@sentry/nextjs';

const SENSITIVE_QUERY_KEYS = /^(?:token|signature|x-amz-|email|rollno)/i;

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (!request) return event;

  if (request.headers) {
    for (const key of Object.keys(request.headers)) {
      if (/^(?:cookie|authorization)$/i.test(key)) delete request.headers[key];
    }
  }
  if (request.data !== undefined) request.data = '[Filtered]';
  const query = request.query_string;
  if (typeof query === 'string') {
    if (query) request.query_string = '[Filtered]';
  } else if (Array.isArray(query)) {
    request.query_string = query.map(([key, value]): [string, string] => [
      key,
      SENSITIVE_QUERY_KEYS.test(key) ? '[Filtered]' : value,
    ]);
  } else if (query) {
    for (const key of Object.keys(query)) {
      if (SENSITIVE_QUERY_KEYS.test(key)) query[key] = '[Filtered]';
    }
  }
  if (request.url) {
    try {
      const url = new URL(request.url);
      for (const key of url.searchParams.keys()) {
        if (SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.set(key, '[Filtered]');
      }
      request.url = url.toString();
    } catch {}
  }
  return event;
}
