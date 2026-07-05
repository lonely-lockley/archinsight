import type { Cookies } from '@sveltejs/kit';
import { getAuthConfig, loginOptions, type EnvSource } from './auth-config';
import { verifyStandaloneToken } from './standalone-token';
import { authenticateSsrSession, authenticateStandaloneClaims } from './userdata-store';
import type { AuthenticatedUser, AuthUserResponse } from './types';

export async function currentUserResponse(cookies: Cookies, env: EnvSource | undefined): Promise<AuthUserResponse> {
  const config = getAuthConfig(env);
  const claims = verifyStandaloneToken(cookies.get(config.tokenCookieName), config.token);
  const user =
    (await authenticateStandaloneClaims(claims, env)) ??
    (config.ghost.enabled
      ? await authenticateSsrSession(cookies.get(config.ghost.ssrCookieName), env, config.token.secret)
      : null);
  if (!user) {
    const options = loginOptions(config);
    return {
      authenticated: false,
      id: null,
      email: null,
      displayName: null,
      avatar: null,
      loginUrl: config.loginUrl,
      logoutUrl: null,
      loginOptions: options
    };
  }

  return {
    authenticated: true,
    id: user.id,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    avatar: user.avatar ?? null,
    loginUrl: null,
    logoutUrl: config.logoutUrl,
    loginOptions: loginOptions(config)
  };
}

export async function authenticateRequired(cookies: Cookies, env: EnvSource | undefined): Promise<AuthenticatedUser> {
  const config = getAuthConfig(env);
  const user =
    (await authenticateStandaloneClaims(verifyStandaloneToken(cookies.get(config.tokenCookieName), config.token), env)) ??
    (config.ghost.enabled
      ? await authenticateSsrSession(cookies.get(config.ghost.ssrCookieName), env, config.token.secret)
      : null);
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: {
        'content-type': 'application/json'
      }
    });
  }
  return user;
}
