import { issueStandaloneSession } from '$lib/server/auth/standalone-sync-service';
import { eventEnv } from '$lib/server/auth/svelte-event';

export const POST = async (event) =>
  issueStandaloneSession(
    event.request.headers.get('authorization'),
    await event.request.json(),
    event.cookies,
    eventEnv(event)
  );
