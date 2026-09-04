import { playgroundLink } from '$lib/server/publication/playground-project-service';
import type { LinkRequest } from '$lib/server/language/types';
import { parseLinkRequest } from '@archinsight/contracts';
import { jsonEndpoint, requestJson, services } from '../../projects/route-utils';

export const POST = (event) => jsonEndpoint(event, async () =>
  playgroundLink(services(event), await requestJson<LinkRequest>(event, parseLinkRequest))
);
