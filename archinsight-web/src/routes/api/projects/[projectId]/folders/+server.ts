import { createFolder, deleteFolder } from '$lib/server/repository/project-file-service';
import { emptyEndpoint, env, jsonEndpoint, pathParam } from '../../route-utils';
import type { FolderCreateRequest } from '$lib/server/repository/types';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    createFolder(event.cookies, env(event), pathParam(event, 'projectId'), (await event.request.json()) as FolderCreateRequest | null)
  );

export const DELETE = (event) =>
  emptyEndpoint(event, () =>
    deleteFolder(event.cookies, env(event), pathParam(event, 'projectId'), event.url.searchParams.get('path') ?? '')
  );
