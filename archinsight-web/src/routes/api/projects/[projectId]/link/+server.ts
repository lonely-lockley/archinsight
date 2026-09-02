import { link } from '$lib/server/language/language-pipeline';
import { env, jsonEndpoint, pathParam, requestJson } from '../../route-utils';
import type { LinkRequest } from '$lib/server/language/types';
import { parseLinkRequest } from '@archinsight/contracts';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    link(event.cookies, env(event), pathParam(event, 'projectId'), await requestJson<LinkRequest>(event, parseLinkRequest))
  );
