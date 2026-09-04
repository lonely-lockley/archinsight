import { error } from '@sveltejs/kit';
import { postLoginRedirect } from '$lib/server/auth/auth-config';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { upsertUserdataProfile } from '$lib/server/auth/userdata-store';
import { synchronizeGhostUser } from '$lib/server/auth/ghost-service';

export const GET = async (event) => {
  const services = event.locals.services;
  const config = services.config.auth;
  if (!config.devLoginEnabled || !config.devUserId) {
    error(404, { message: 'Dev login is disabled' });
  }

  const profile = {
    id: config.devUserId,
    email: config.devUserEmail,
    displayName: config.devUserDisplayName,
    source: 'local-dev'
  };
  if (config.ghost.enabled) {
    await synchronizeGhostUser(profile, event.cookies, services, event.fetch);
  } else {
    const user = await upsertUserdataProfile(profile, services);
    const token = issueStandaloneToken(user, config.token);
    event.cookies.delete(config.ghost.ssrCookieName, { path: '/' });
    event.cookies.delete(`${config.ghost.ssrCookieName}.sig`, { path: '/' });
    event.cookies.set(config.tokenCookieName, token, {
      path: '/',
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax'
    });
  }

  return new Response(null, {
    status: 307,
    headers: {
      location: postLoginRedirect(config, event.url.searchParams.get('returnTo'))
    }
  });
};
