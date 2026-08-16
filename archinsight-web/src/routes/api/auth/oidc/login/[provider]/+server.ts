import { startOidcLogin } from '$lib/server/auth/oidc-service';
import { eventEnv } from '$lib/server/auth/svelte-event';

export const GET = (event) =>
  authResponse(() => startOidcLogin(event.params.provider, event.url.searchParams.get('returnTo'), event.cookies, eventEnv(event)));

function authResponse(handler: () => Response): Response {
  try {
    return handler();
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'OIDC login failed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
}
