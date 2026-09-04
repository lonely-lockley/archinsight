import { playgroundRead } from '$lib/server/publication/playground-project-service';
import { jsonEndpoint, services } from '../../../projects/route-utils';

export const GET = (event) => jsonEndpoint(event, () => playgroundRead(services(event), event.url.searchParams.get('path') ?? ''));
