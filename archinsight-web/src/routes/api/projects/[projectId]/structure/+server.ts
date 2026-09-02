import { structure } from '$lib/server/language/language-pipeline';
import { env, jsonEndpoint, pathParam, requestJson } from '../../route-utils';
import type { ProjectStructureRequest } from '$lib/server/language/types';
import { parseProjectStructureRequest } from '@archinsight/contracts';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    structure(event.cookies, env(event), pathParam(event, 'projectId'), await requestJson<ProjectStructureRequest>(event, parseProjectStructureRequest))
  );
