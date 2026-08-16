import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { getAuthConfig } from '$lib/server/auth/auth-config';
import { eventEnv } from '$lib/server/auth/svelte-event';
import { verifiedGhostSession } from '$lib/server/auth/request-auth';
import { verifyStandaloneToken } from '$lib/server/auth/standalone-token';
import { revokeSsrSession, revokeUserSessions } from '$lib/server/auth/userdata-store';

const logout = async (event: RequestEvent) => {
  const env = eventEnv(event);
  const config = getAuthConfig(env);

  try {
    if (config.ghost.enabled) {
      const ghostSession = verifiedGhostSession(event.cookies, config.ghost);
      if (ghostSession) {
        await revokeSsrSession(ghostSession, env, config.token.secret);
      }
    } else {
      const standaloneClaims = verifyStandaloneToken(event.cookies.get(config.tokenCookieName), config.token);
      if (standaloneClaims) {
        await revokeUserSessions(standaloneClaims.userId, env);
      }
    }
  } finally {
    event.cookies.delete(config.tokenCookieName, { path: '/' });
    event.cookies.delete(config.ghost.ssrCookieName, { path: '/' });
    event.cookies.delete(`${config.ghost.ssrCookieName}.sig`, { path: '/' });
  }

  return json({ ok: true });
};

export const POST = logout;
export const GET = logout;
