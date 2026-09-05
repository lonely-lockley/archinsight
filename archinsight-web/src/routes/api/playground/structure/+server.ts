import { playgroundStructure } from '$lib/server/publication/playground-project-service';
import type { ProjectStructureRequest } from '$lib/server/language/types';
import { parseProjectStructureRequest } from '@archinsight/contracts';
import { jsonEndpoint, requestJson, services } from '../../projects/route-utils';

export const POST = (event) => jsonEndpoint(event, async () =>
  playgroundStructure(services(event), await requestJson<ProjectStructureRequest>(event, parseProjectStructureRequest))
);
