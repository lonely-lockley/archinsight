import { completeOidcLogin } from '$lib/server/auth/oidc-service';
import { eventEnv } from '$lib/server/auth/svelte-event';

export const GET = (event) =>
  authResponse(() => completeOidcLogin(event.params.provider, event.url, event.cookies, eventEnv(event), event.fetch));

async function authResponse(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'OIDC login failed' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
}
