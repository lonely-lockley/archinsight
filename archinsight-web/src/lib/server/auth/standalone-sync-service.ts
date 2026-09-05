import type { Cookies } from '@sveltejs/kit';
import { bearerTokenMatches } from './bearer-token';
import type { ApplicationServices } from '$lib/server/config/application-services';
import { issueStandaloneToken } from './standalone-token';
import { upsertUserdataProfile } from './userdata-store';
import type { AuthUserResponse, UserdataProfile } from './types';

type StandaloneTokenRequest = {
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

export async function issueStandaloneSession(
  authorization: string | null,
  request: StandaloneTokenRequest | null,
  cookies: Cookies,
  services: ApplicationServices
): Promise<Response> {
  const config = services.config.auth;
  if (config.ghost.enabled) {
    return jsonError('Standalone token endpoint is unavailable in Ghost mode', 404);
  }
  if (!config.standaloneSyncApiToken) {
    return jsonError('Standalone token endpoint is not configured', 404);
  }
  if (!bearerTokenMatches(config.standaloneSyncApiToken, authorization)) {
    return jsonError('Invalid standalone token sync token', 401);
  }
  if (!request) {
    return jsonError('Standalone token request is required', 400);
  }

  const user = await upsertUserdataProfile(profileFromStandaloneRequest(request), services);
  const token = issueStandaloneToken(user, config.token);
  cookies.delete(config.ghost.ssrCookieName, { path: '/' });
  cookies.delete(`${config.ghost.ssrCookieName}.sig`, { path: '/' });
  cookies.set(config.tokenCookieName, token, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax'
  });

  return new Response(
    JSON.stringify({
      authenticated: true,
      id: user.id,
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      avatar: user.avatar ?? null,
      loginUrl: null,
      logoutUrl: config.logoutUrl,
      loginOptions: []
    } satisfies AuthUserResponse),
    {
      status: 200,
      headers: {
        'content-type': 'application/json'
      }
    }
  );
}

function profileFromStandaloneRequest(request: StandaloneTokenRequest): UserdataProfile {
  return {
    email: request.email ?? '',
    emailVerified: request.emailVerified ?? null,
    firstName: request.firstName ?? null,
    lastName: request.lastName ?? null,
    displayName: request.displayName ?? null,
    avatar: request.avatar ?? null,
    originId: request.originId ?? null,
    source: request.source && request.source.trim() !== '' ? request.source : 'standalone',
    locale: request.locale ?? null
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
