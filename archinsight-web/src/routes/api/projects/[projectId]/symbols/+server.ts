import { symbols } from '$lib/server/language/language-pipeline';
import { jsonEndpoint, pathParam, services } from '../../route-utils';

export const GET = (event) =>
  jsonEndpoint(event, () => symbols(event.cookies, services(event), pathParam(event, 'projectId')));
