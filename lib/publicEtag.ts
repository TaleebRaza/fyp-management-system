import { createHash } from 'node:crypto';

export function createPublicEtag(body: unknown) {
  return `\"${createHash('sha256').update(JSON.stringify(body)).digest('base64url')}\"`;
}
