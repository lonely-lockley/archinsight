import { syncGhostUser } from '$lib/server/auth/ghost-service';

export const POST = async (event) =>
  syncGhostUser(
    event.request.headers.get('authorization'),
    await event.request.json(),
    event.cookies,
    event.locals.services,
    event.fetch
  );
