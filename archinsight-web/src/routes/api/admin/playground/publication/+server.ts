import {
  managePlaygroundPublication,
  publishProject,
  unpublishProject
} from '$lib/server/publication/playground-publication-service';
import { invalidRequest } from '$lib/server/errors/application-error';
import { parsePublishPlaygroundRequest } from '@archinsight/contracts';
import { emptyEndpoint, jsonEndpoint, requestJson, services } from '../../../projects/route-utils';

export const GET = (event) => jsonEndpoint(event, () => managePlaygroundPublication(event.cookies, services(event)));

export const PUT = (event) => jsonEndpoint(event, async () => {
  const body = await requestJson(event, parsePublishPlaygroundRequest);
  if (typeof body?.projectId !== 'string' || body.projectId.trim() === '') {
    throw invalidRequest('projectId is required');
  }
  return publishProject(event.cookies, services(event), body.projectId.trim());
});

export const DELETE = (event) => emptyEndpoint(event, () => unpublishProject(event.cookies, services(event)));
