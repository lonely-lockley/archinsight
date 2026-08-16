import type { Cookies } from '@sveltejs/kit';
import { getAuthConfig, loginOptions, type EnvSource } from './auth-config';
import { verifyStandaloneToken } from './standalone-token';
import { authenticateSsrSession, authenticateStandaloneClaims } from './userdata-store';
import { capabilitiesFor } from './authorization';
import { verifyGhostSessionSignature } from './ghost-session';
import type { AuthenticatedUser, AuthUserResponse } from './types';

export async function currentUserResponse(cookies: Cookies, env: EnvSource | undefined): Promise<AuthUserResponse> {
  const config = getAuthConfig(env);
  const ghostSession = verifiedGhostSession(cookies, config.ghost);
  const user = config.ghost.enabled
    ? await authenticateSsrSession(ghostSession, env, config.token.secret)
    : await authenticateStandaloneClaims(verifyStandaloneToken(cookies.get(config.tokenCookieName), config.token), env);
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
      loginOptions: options,
      roles: [],
      capabilities: []
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
    loginOptions: loginOptions(config),
    roles: user.roles,
    capabilities: capabilitiesFor(user)
  };
}

export async function authenticateRequired(cookies: Cookies, env: EnvSource | undefined): Promise<AuthenticatedUser> {
  const config = getAuthConfig(env);
  const ghostSession = verifiedGhostSession(cookies, config.ghost);
  const user = config.ghost.enabled
    ? await authenticateSsrSession(ghostSession, env, config.token.secret)
    : await authenticateStandaloneClaims(verifyStandaloneToken(cookies.get(config.tokenCookieName), config.token), env);
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

function verifiedGhostSession(cookies: Cookies, ghost: ReturnType<typeof getAuthConfig>['ghost']): string | null {
  const session = cookies.get(ghost.ssrCookieName);
  const signature = cookies.get(`${ghost.ssrCookieName}.sig`);
  return verifyGhostSessionSignature(session, signature, ghost) ? session ?? null : null;
}
