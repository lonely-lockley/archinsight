import { issueStandaloneSession } from '$lib/server/auth/standalone-sync-service';

export const POST = async (event) =>
  issueStandaloneSession(
    event.request.headers.get('authorization'),
    await event.request.json(),
    event.cookies,
    event.locals.services
  );
