import { link } from '$lib/server/language/language-pipeline';
import { env, jsonEndpoint, pathParam } from '../../route-utils';
import type { LinkRequest } from '$lib/server/language/types';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    link(event.cookies, env(event), pathParam(event, 'projectId'), (await event.request.json()) as LinkRequest | null)
  );
