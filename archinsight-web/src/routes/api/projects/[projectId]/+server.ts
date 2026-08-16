import { deleteProject, updateProject } from '$lib/server/repository/project-file-service';
import type { ProjectUpdateRequest } from '$lib/server/repository/types';
import { env, jsonEndpoint, pathParam } from '../route-utils';

export const PATCH = (event) => jsonEndpoint(event, async () =>
  updateProject(
    event.cookies,
    env(event),
    pathParam(event, 'projectId'),
    (await event.request.json()) as ProjectUpdateRequest | null
  )
);

export const DELETE = (event) => jsonEndpoint(event, () =>
  deleteProject(event.cookies, env(event), pathParam(event, 'projectId'))
);
