import { playgroundRead } from '$lib/server/publication/playground-project-service';
import { env, jsonEndpoint } from '../../../projects/route-utils';

export const GET = (event) => jsonEndpoint(event, () => playgroundRead(env(event), event.url.searchParams.get('path') ?? ''));
