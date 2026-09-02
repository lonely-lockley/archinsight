import { playgroundStructure } from '$lib/server/publication/playground-project-service';
import type { ProjectStructureRequest } from '$lib/server/language/types';
import { env, jsonEndpoint, requestJson } from '../../projects/route-utils';

export const POST = (event) => jsonEndpoint(event, async () =>
  playgroundStructure(env(event), await requestJson<ProjectStructureRequest | null>(event))
);
