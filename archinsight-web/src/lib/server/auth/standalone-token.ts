import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  AuthenticatedUser,
  StandaloneTokenClaims,
  StandaloneTokenConfig
} from './types';

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  iat?: number;
  exp?: number;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  token_version?: number;
};

export function issueStandaloneToken(user: Omit<AuthenticatedUser, 'roles'> & { roles?: AuthenticatedUser['roles'] }, config: StandaloneTokenConfig): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + Math.floor(config.ttlMinutes * 60);
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({
    iss: config.issuer,
    aud: config.audience,
    sub: user.id,
    iat: issuedAt,
    exp: expiresAt,
    email: user.email ?? null,
    name: user.displayName ?? null,
    picture: user.avatar ?? null,
    token_version: user.tokenVersion
  });
  const data = `${header}.${payload}`;
  return `${data}.${sign(data, config.secret)}`;
}

export function verifyStandaloneToken(token: string | null | undefined, config: StandaloneTokenConfig): StandaloneTokenClaims | null {
  if (!token || token.trim() === '') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const data = `${encodedHeader}.${encodedPayload}`;
  if (!constantTimeEquals(sign(data, config.secret), signature)) {
    return null;
  }

  const header = parseJson<Record<string, unknown>>(encodedHeader);
  const payload = parseJson<JwtPayload>(encodedPayload);
  if (!header || !payload || header.alg !== 'HS256') {
    return null;
  }
  if (payload.iss !== config.issuer || !audienceMatches(payload.aud, config.audience)) {
    return null;
  }
  if (!payload.sub || typeof payload.token_version !== 'number') {
    return null;
  }
  if (!isUuid(payload.sub)) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return null;
  }

  return {
    userId: payload.sub,
    tokenVersion: payload.token_version,
    email: payload.email ?? null,
    displayName: payload.name ?? null,
    avatar: payload.picture ?? null
  };
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function parseJson<T>(encoded: string): T | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function sign(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

function constantTimeEquals(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function audienceMatches(actual: string | string[] | undefined, expected: string): boolean {
  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }
  return actual === expected;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
