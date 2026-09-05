import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { verifiedGhostSession } from '$lib/server/auth/request-auth';
import { verifyStandaloneToken } from '$lib/server/auth/standalone-token';
import { revokeSsrSession, revokeUserSessions } from '$lib/server/auth/userdata-store';

const logout = async (event: RequestEvent) => {
  const services = event.locals.services;
  const config = services.config.auth;

  try {
    if (config.ghost.enabled) {
      const ghostSession = verifiedGhostSession(event.cookies, config.ghost);
      if (ghostSession) {
        await revokeSsrSession(ghostSession, services, config.token.secret);
      }
    } else {
      const standaloneClaims = verifyStandaloneToken(event.cookies.get(config.tokenCookieName), config.token);
      if (standaloneClaims) {
        await revokeUserSessions(standaloneClaims.userId, services);
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
