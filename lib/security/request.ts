export function isContentLengthTooLarge(request: Request, maximumBytes: number) {
  const value = request.headers.get('content-length');
  if (!value) return false;
  const contentLength = Number(value);
  return !Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maximumBytes;
}

export const JSON_BODY_LIMITS = {
  control: 8 * 1024,
  form: 32 * 1024,
  metadata: 16 * 1024,
  bulk: 256 * 1024,
} as const;

type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; response: Response };

export async function readBoundedJson(
  request: Request,
  maximumBytes: number
): Promise<BoundedJsonResult> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    return {
      ok: false,
      response: Response.json({ error: 'Content-Type must be application/json.' }, { status: 415 }),
    };
  }

  if (isContentLengthTooLarge(request, maximumBytes)) {
    return {
      ok: false,
      response: Response.json({ error: 'Request body is too large.' }, { status: 413 }),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: Response.json({ error: 'Request body must contain valid JSON.' }, { status: 400 }),
    };
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytesRead = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The body is already rejected; transport cleanup is best effort.
        }
        return {
          ok: false,
          response: Response.json({ error: 'Request body is too large.' }, { status: 413 }),
        };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();

    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Request body must contain valid JSON.' }, { status: 400 }),
    };
  }
}
