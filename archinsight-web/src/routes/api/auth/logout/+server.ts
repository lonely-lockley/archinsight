import { json } from '@sveltejs/kit';
import { getAuthConfig } from '$lib/server/auth/auth-config';
import { eventEnv } from '$lib/server/auth/svelte-event';

export const POST = (event) => {
  const config = getAuthConfig(eventEnv(event));
  event.cookies.delete(config.tokenCookieName, { path: '/' });
  event.cookies.delete(config.ghost.ssrCookieName, { path: '/' });
  event.cookies.delete(`${config.ghost.ssrCookieName}.sig`, { path: '/' });
  return json({ ok: true });
};
