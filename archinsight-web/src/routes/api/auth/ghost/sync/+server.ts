import { syncGhostUser } from '$lib/server/auth/ghost-service';
import { eventEnv } from '$lib/server/auth/svelte-event';

export const POST = async (event) =>
  syncGhostUser(
    event.request.headers.get('authorization'),
    await event.request.json(),
    event.cookies,
    eventEnv(event),
    event.fetch
  );
