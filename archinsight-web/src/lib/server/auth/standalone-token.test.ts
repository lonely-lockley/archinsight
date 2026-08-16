import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { issueStandaloneToken, verifyStandaloneToken } from './standalone-token';

const config = {
  secret: 'standalone-token-test-secret',
  issuer: 'archinsight-test',
  audience: 'archinsight-editor-test',
  ttlMinutes: 30
};

describe('standalone token service', () => {
  it('verifies issued token audience and token version', () => {
    const token = issueStandaloneToken(
      {
        id: '5913933c-2268-41e1-a558-622dc11f675a',
        email: 'owner@example.com',
        displayName: 'Owner',
        avatar: 'https://example.com/avatar.png',
        tokenVersion: 7
      },
      config
    );

    expect(verifyStandaloneToken(token, config)).toEqual({
      userId: '5913933c-2268-41e1-a558-622dc11f675a',
      tokenVersion: 7,
      email: 'owner@example.com',
      displayName: 'Owner',
      avatar: 'https://example.com/avatar.png'
    });
  });

  it('rejects token for different audience', () => {
    const token = issueStandaloneToken(
      {
        id: '5913933c-2268-41e1-a558-622dc11f675a',
        email: 'owner@example.com',
        displayName: 'Owner',
        tokenVersion: 1
      },
      config
    );

    expect(verifyStandaloneToken(token, { ...config, audience: 'another-client' })).toBeNull();
  });

  it('rejects legacy token without token version', () => {
    const token = issueLegacyTokenWithoutVersion();

    expect(verifyStandaloneToken(token, config)).toBeNull();
  });
});

function issueLegacyTokenWithoutVersion(): string {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({
    iss: config.issuer,
    aud: config.audience,
    sub: '5913933c-2268-41e1-a558-622dc11f675a',
    iat: now,
    exp: now + 60
  });
  const data = `${header}.${payload}`;
  const signature = cryptoSign(data, config.secret);
  return `${data}.${signature}`;
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function cryptoSign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}
