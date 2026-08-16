import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GhostConfig } from './auth-config';

export function verifyGhostSessionSignature(session: string | null | undefined, signature: string | null | undefined, ghost: GhostConfig): boolean {
  if (!session || !signature || !ghost.ssrSecretKey) {
    return false;
  }
  const expected = createHmac('sha1', ghost.ssrSecretKey)
    .update(`${ghost.ssrCookieName}=${session}`, 'utf8')
    .digest('base64url');
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
