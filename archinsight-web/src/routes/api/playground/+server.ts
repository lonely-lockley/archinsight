import { playgroundProjects } from '$lib/server/publication/playground-project-service';
import { env, jsonEndpoint } from '../projects/route-utils';

export const GET = (event) => jsonEndpoint(event, () => playgroundProjects(env(event)));
