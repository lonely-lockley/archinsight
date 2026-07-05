import { tree } from '$lib/server/repository/project-file-service';
import { env, jsonEndpoint, pathParam } from '../../route-utils';

export const GET = (event) =>
  jsonEndpoint(event, () => tree(event.cookies, env(event), pathParam(event, 'projectId')));
