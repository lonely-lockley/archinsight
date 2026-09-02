import { createFolder, deleteFolder } from '$lib/server/repository/project-file-service';
import { emptyEndpoint, env, jsonEndpoint, pathParam, requestJson } from '../../route-utils';
import type { FolderCreateRequest } from '$lib/server/repository/types';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    createFolder(event.cookies, env(event), pathParam(event, 'projectId'), await requestJson<FolderCreateRequest | null>(event))
  );

export const DELETE = (event) =>
  emptyEndpoint(event, () =>
    deleteFolder(event.cookies, env(event), pathParam(event, 'projectId'), event.url.searchParams.get('path') ?? '')
  );
