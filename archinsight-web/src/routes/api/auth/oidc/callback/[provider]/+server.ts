import { completeOidcLogin } from '$lib/server/auth/oidc-service';

export const GET = (event) =>
  authResponse(() => completeOidcLogin(
    event.params.provider,
    event.url,
    event.cookies,
    event.locals.services,
    event.fetch
  ));

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
