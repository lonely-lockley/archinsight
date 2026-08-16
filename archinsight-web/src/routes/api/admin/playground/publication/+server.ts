import {
  managePlaygroundPublication,
  publishProject,
  unpublishProject
} from '$lib/server/publication/playground-publication-service';
import { emptyEndpoint, env, jsonEndpoint } from '../../../projects/route-utils';

export const GET = (event) => jsonEndpoint(event, () => managePlaygroundPublication(event.cookies, env(event)));

export const PUT = (event) => jsonEndpoint(event, async () => {
  const body = await event.request.json() as { projectId?: unknown };
  if (typeof body?.projectId !== 'string' || body.projectId.trim() === '') {
    throw new Error('projectId is required');
  }
  return publishProject(event.cookies, env(event), body.projectId.trim());
});

export const DELETE = (event) => emptyEndpoint(event, () => unpublishProject(event.cookies, env(event)));
