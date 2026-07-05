import { error } from '@sveltejs/kit';
import { getAuthConfig, postLoginRedirect } from '$lib/server/auth/auth-config';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { eventEnv } from '$lib/server/auth/svelte-event';
import { upsertUserdataProfile } from '$lib/server/auth/userdata-store';

export const GET = async (event) => {
  const env = eventEnv(event);
  const config = getAuthConfig(env);
  if (!config.devLoginEnabled || !config.devUserId) {
    error(404, { message: 'Dev login is disabled' });
  }

  const user = await upsertUserdataProfile(
    {
      id: config.devUserId,
      email: config.devUserEmail,
      displayName: config.devUserDisplayName,
      source: 'local-dev'
    },
    env
  );
  const token = issueStandaloneToken(
    user,
    config.token
  );
  event.cookies.set(config.tokenCookieName, token, {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax'
  });

  return new Response(null, {
    status: 307,
    headers: {
      location: postLoginRedirect(config, event.url.searchParams.get('returnTo'))
    }
  });
};
