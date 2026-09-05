import { deleteProject, updateProject } from '$lib/server/repository/project-file-service';
import type { ProjectUpdateRequest } from '$lib/server/repository/types';
import { parseProjectUpdateRequest } from '@archinsight/contracts';
import { jsonEndpoint, pathParam, requestJson, services } from '../route-utils';

export const PATCH = (event) => jsonEndpoint(event, async () =>
  updateProject(
    event.cookies,
    services(event),
    pathParam(event, 'projectId'),
    await requestJson<ProjectUpdateRequest>(event, parseProjectUpdateRequest)
  )
);

export const DELETE = (event) => jsonEndpoint(event, () =>
  deleteProject(event.cookies, services(event), pathParam(event, 'projectId'))
);
