import { playgroundLink } from '$lib/server/publication/playground-project-service';
import type { LinkRequest } from '$lib/server/language/types';
import { env, jsonEndpoint, requestJson } from '../../projects/route-utils';

export const POST = (event) => jsonEndpoint(event, async () =>
  playgroundLink(env(event), await requestJson<LinkRequest | null>(event))
);
