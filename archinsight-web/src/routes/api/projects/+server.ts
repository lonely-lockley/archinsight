import { createProject, projects } from '$lib/server/repository/project-file-service';
import type { ProjectCreateRequest } from '$lib/server/repository/types';
import { parseProjectCreateRequest } from '@archinsight/contracts';
import { jsonEndpoint, requestJson, services } from './route-utils';

export const GET = (event) => jsonEndpoint(event, () => projects(event.cookies, services(event)));
export const POST = (event) => jsonEndpoint(event, async () =>
  createProject(event.cookies, services(event), await requestJson<ProjectCreateRequest>(event, parseProjectCreateRequest))
);
