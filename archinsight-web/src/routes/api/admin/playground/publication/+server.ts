import {
  managePlaygroundPublication,
  publishProject,
  unpublishProject
} from '$lib/server/publication/playground-publication-service';
import { invalidRequest } from '$lib/server/errors/application-error';
import { emptyEndpoint, env, jsonEndpoint, requestJson } from '../../../projects/route-utils';

export const GET = (event) => jsonEndpoint(event, () => managePlaygroundPublication(event.cookies, env(event)));

export const PUT = (event) => jsonEndpoint(event, async () => {
  const body = await requestJson<{ projectId?: unknown }>(event);
  if (typeof body?.projectId !== 'string' || body.projectId.trim() === '') {
    throw invalidRequest('projectId is required');
  }
  return publishProject(event.cookies, env(event), body.projectId.trim());
});

export const DELETE = (event) => emptyEndpoint(event, () => unpublishProject(event.cookies, env(event)));
