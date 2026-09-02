import { createProject, projects } from '$lib/server/repository/project-file-service';
import type { ProjectCreateRequest } from '$lib/server/repository/types';
import { parseProjectCreateRequest } from '@archinsight/contracts';
import { env, jsonEndpoint, requestJson } from './route-utils';

export const GET = (event) => jsonEndpoint(event, () => projects(event.cookies, env(event)));
export const POST = (event) => jsonEndpoint(event, async () =>
  createProject(event.cookies, env(event), await requestJson<ProjectCreateRequest>(event, parseProjectCreateRequest))
);
