import { projects } from '$lib/server/repository/project-file-service';
import { env, jsonEndpoint } from './route-utils';

export const GET = (event) => jsonEndpoint(event, () => projects(event.cookies, env(event)));
