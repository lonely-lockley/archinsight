import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyGhostSessionSignature } from './ghost-session';

const ghost = {
  enabled: true,
  adminApiUrl: 'https://ghost.example',
  publicUrl: 'https://ghost.example',
  adminApiKey: null,
  syncApiToken: null,
  ssrCookieName: 'ghost-members-ssr',
  ssrSecretKey: 'theme-session-secret'
};

describe('Ghost SSR session signature', () => {
  it('accepts the signed cookie pair produced by Ghost', () => {
    const session = 'member-transient-id';
    const signature = createHmac('sha1', ghost.ssrSecretKey)
      .update(`${ghost.ssrCookieName}=${session}`)
      .digest('base64url');

    expect(verifyGhostSessionSignature(session, signature, ghost)).toBe(true);
  });

  it('rejects missing, modified, and incorrectly signed cookies', () => {
    const signature = createHmac('sha1', 'different-secret')
      .update('ghost-members-ssr=member-transient-id')
      .digest('base64url');

    expect(verifyGhostSessionSignature('member-transient-id', signature, ghost)).toBe(false);
    expect(verifyGhostSessionSignature('member-transient-id', null, ghost)).toBe(false);
    expect(verifyGhostSessionSignature(null, signature, ghost)).toBe(false);
  });
});
