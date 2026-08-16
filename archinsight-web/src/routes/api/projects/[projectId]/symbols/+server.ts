import { symbols } from '$lib/server/language/language-pipeline';
import { env, jsonEndpoint, pathParam } from '../../route-utils';

export const GET = (event) =>
  jsonEndpoint(event, () => symbols(event.cookies, env(event), pathParam(event, 'projectId')));
