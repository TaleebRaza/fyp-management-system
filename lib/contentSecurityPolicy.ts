export function createContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const developmentScriptSource = isDevelopment ? " 'unsafe-eval'" : '';

  return [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https:",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    "style-src 'self' 'unsafe-inline' https:",
  ].join('; ');
}
