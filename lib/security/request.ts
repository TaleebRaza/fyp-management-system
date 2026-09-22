export function isContentLengthTooLarge(request: Request, maximumBytes: number) {
  const value = request.headers.get('content-length');
  if (!value) return false;
  const contentLength = Number(value);
  return !Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > maximumBytes;
}
