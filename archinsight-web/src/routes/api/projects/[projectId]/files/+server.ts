import { tree } from '$lib/server/repository/project-file-service';
import { jsonEndpoint, pathParam, services } from '../../route-utils';

export const GET = (event) =>
  jsonEndpoint(event, () => tree(event.cookies, services(event), pathParam(event, 'projectId')));
