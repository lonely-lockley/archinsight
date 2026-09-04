import { createHmac } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import type { GhostConfig } from './auth-config';
import type { ApplicationServices } from '$lib/server/config/application-services';
import { bearerTokenMatches } from './bearer-token';
import { storeSsrSession, upsertUserdataProfile } from './userdata-store';
import type { AuthenticatedUser, AuthUserResponse, UserdataProfile } from './types';

type GhostSyncRequest = {
  email?: string | null;
  emailVerified?: boolean | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatar?: string | null;
  originId?: string | null;
  source?: string | null;
  locale?: string | null;
};

type GhostMemberData = {
  members?: GhostMember[];
};

type GhostMember = {
  id?: string;
  email?: string;
  name?: string;
};

type GhostSigninUrlResponse = {
  member_signin_urls?: Array<{ url?: string }>;
};

type GhostSessionCookie = {
  name: string;
  value: string;
};

const defaultFetch: typeof fetch = (...args) => fetch(...args);

export type GhostSynchronizationResult = {
  user: AuthenticatedUser;
  response: AuthUserResponse;
};

export async function syncGhostUser(
  authorization: string | null,
  request: GhostSyncRequest | null,
  cookies: Cookies,
  services: ApplicationServices,
  fetcher: typeof fetch = defaultFetch
): Promise<Response> {
  const config = services.config.auth;
  const authorizationError = requireGhostSyncAuthorization(config.ghost, authorization);
  if (authorizationError) {
    return authorizationError;
  }
  if (!config.ghost.enabled) {
    return jsonError('Ghost integration is disabled', 404);
  }
  if (!request) {
    return jsonError('Ghost sync request is required', 400);
  }

  const result = await synchronizeGhostUser(profileFromGhostRequest(request), cookies, services, fetcher);

  return new Response(JSON.stringify(result.response), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    }
  });
}

export async function synchronizeGhostUser(
  profile: UserdataProfile,
  cookies: Cookies,
  services: ApplicationServices,
  fetcher: typeof fetch = defaultFetch
): Promise<GhostSynchronizationResult> {
  const config = services.config.auth;
  if (!config.ghost.enabled) {
    throw new Error('Ghost integration is disabled');
  }
  const user = await upsertUserdataProfile(profile, services);
  const member = await resolveMember(config.ghost, user.email ?? profile.email, user.displayName ?? profile.displayName ?? profile.email, fetcher);
  const sessionCookies = await signinCookies(config.ghost, member, fetcher);
  const ssrSession = sessionCookies.find((cookie) => cookie.name === config.ghost.ssrCookieName)?.value ?? null;
  await storeSsrSession(user.email ?? profile.email, ssrSession, services, config.token.secret);
  cookies.delete(config.tokenCookieName, { path: '/' });
  for (const cookie of sessionCookies) {
    cookies.set(cookie.name, cookie.value, {
      path: '/',
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax'
    });
  }

  return {
    user,
    response: {
      authenticated: true,
      id: user.id,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      loginUrl: null,
      logoutUrl: config.logoutUrl,
      loginOptions: []
    }
  };
}

async function resolveMember(
  ghost: GhostConfig,
  email: string,
  displayName: string,
  fetcher: typeof fetch
): Promise<GhostMember> {
  let data = await ghostJson<GhostMemberData>(ghost, `/ghost/api/admin/members/?filter=${encodeURIComponent(`email:'${email}'`)}`, {
    method: 'GET'
  }, fetcher);
  const found = data.members ?? [];
  if (found.length > 1) {
    throw new Error(`Ghost member search returned multiple members for email ${email}`);
  }
  if (found.length === 0) {
    data = await ghostJson<GhostMemberData>(
      ghost,
      '/ghost/api/admin/members',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          members: [
            {
              email,
              name: displayName
            }
          ]
        })
      },
      fetcher
    );
  }
  const createdOrFound = data.members ?? [];
  if (createdOrFound.length !== 1 || !createdOrFound[0].id) {
    throw new Error('Ghost member create/search did not return exactly one member');
  }
  return createdOrFound[0];
}

async function signinCookies(ghost: GhostConfig, member: GhostMember, fetcher: typeof fetch): Promise<GhostSessionCookie[]> {
  const response = await ghostJson<GhostSigninUrlResponse>(
    ghost,
    `/ghost/api/admin/members/${encodeURIComponent(member.id ?? '')}/signin_urls/`,
    { method: 'GET' },
    fetcher
  );
  const urls = response.member_signin_urls ?? [];
  if (urls.length === 0 || !urls[0]?.url) {
    throw new Error('Ghost signin URL response is empty');
  }
  if (urls.length > 1) {
    throw new Error('Ghost signin URL response contains multiple URLs');
  }
  const signinUrl = requireGhostOrigin(ghost, urls[0].url);
  const signinResponse = await fetcher(signinUrl, {
    method: 'GET',
    redirect: 'manual'
  });
  return setCookieHeaders(signinResponse.headers).map(sessionCookie).filter((cookie): cookie is GhostSessionCookie => cookie != null);
}

async function ghostJson<T>(ghost: GhostConfig, pathAndQuery: string, init: RequestInit, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(resolveGhostUrl(ghost, pathAndQuery), {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: ghostAdminAuthorizationHeader(ghost),
      ...init.headers
    }
  });
  if (!response.ok) {
    throw new Error(`Ghost Admin API returned HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

function requireGhostSyncAuthorization(ghost: GhostConfig, authorization: string | null): Response | null {
  if (!ghost.syncApiToken) {
    return jsonError('Ghost sync endpoint is not configured', 404);
  }
  if (!bearerTokenMatches(ghost.syncApiToken, authorization)) {
    return jsonError('Invalid Ghost sync token', 401);
  }
  return null;
}

function profileFromGhostRequest(request: GhostSyncRequest): UserdataProfile {
  return {
    email: request.email ?? '',
    emailVerified: request.emailVerified ?? null,
    firstName: request.firstName ?? null,
    lastName: request.lastName ?? null,
    displayName: request.displayName ?? null,
    avatar: request.avatar ?? null,
    originId: request.originId ?? null,
    source: request.source ?? 'ghost',
    locale: request.locale ?? null
  };
}

function resolveGhostUrl(ghost: GhostConfig, pathAndQuery: string): string {
  if (!ghost.adminApiUrl) {
    throw new Error('ARCHINSIGHT_AUTH_GHOST_ADMIN_API_URL must be configured');
  }
  return `${ghost.adminApiUrl.replace(/\/$/u, '')}${pathAndQuery}`;
}

function requireGhostOrigin(ghost: GhostConfig, url: string): string {
  const expectedUrl = ghost.publicUrl ?? ghost.adminApiUrl;
  if (!expectedUrl) {
    throw new Error('ARCHINSIGHT_AUTH_GHOST_PUBLIC_URL or ARCHINSIGHT_AUTH_GHOST_ADMIN_API_URL must be configured');
  }
  const actual = new URL(url);
  const expected = new URL(expectedUrl);
  if (actual.protocol !== expected.protocol || actual.hostname !== expected.hostname || effectivePort(actual) !== effectivePort(expected)) {
    throw new Error('Ghost signin URL points to an unexpected origin');
  }
  return actual.toString();
}

function effectivePort(url: URL): string {
  if (url.port) {
    return url.port;
  }
  return url.protocol === 'https:' ? '443' : '80';
}

function ghostAdminAuthorizationHeader(ghost: GhostConfig): string {
  if (!ghost.adminApiKey) {
    throw new Error('ARCHINSIGHT_AUTH_GHOST_ADMIN_API_KEY must be configured');
  }
  const [keyId, secret, ...extra] = ghost.adminApiKey.split(':');
  if (!keyId || !secret || extra.length > 0) {
    throw new Error("ARCHINSIGHT_AUTH_GHOST_ADMIN_API_KEY must have '<id>:<secret>' format");
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = jwt(
    {
      alg: 'HS256',
      typ: 'JWT',
      kid: keyId
    },
    {
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: '/admin/'
    },
    secret
  );
  return `Ghost ${token}`;
}

function jwt(header: Record<string, unknown>, payload: Record<string, unknown>, hexSecret: string): string {
  const encodedHeader = base64UrlJson(header);
  const encodedPayload = base64UrlJson(payload);
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', Buffer.from(hexSecret, 'hex')).update(data).digest('base64url');
  return `${data}.${signature}`;
}

function base64UrlJson(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function setCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (getSetCookie) {
    return getSetCookie.call(headers);
  }
  const value = headers.get('set-cookie');
  return value ? splitCombinedSetCookie(value) : [];
}

function splitCombinedSetCookie(value: string): string[] {
  return value.split(/,(?=\s*[^;,\s]+=)/u).map((item) => item.trim()).filter(Boolean);
}

function sessionCookie(setCookie: string): GhostSessionCookie | null {
  const [pair] = setCookie.split(';', 1);
  const equals = pair.indexOf('=');
  if (equals <= 0) {
    return null;
  }
  return {
    name: pair.slice(0, equals),
    value: pair.slice(equals + 1)
  };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });
}
