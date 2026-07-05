import { timingSafeEqual } from 'node:crypto';

export function bearerTokenMatches(expectedToken: string | null, authorization: string | null): boolean {
  if (!expectedToken) {
    return false;
  }
  return constantTimeEquals(`Bearer ${expectedToken}`, authorization?.trim() ?? '');
}

function constantTimeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
