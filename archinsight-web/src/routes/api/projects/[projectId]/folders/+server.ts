import { createFolder, deleteFolder } from '$lib/server/repository/project-file-service';
import { emptyEndpoint, jsonEndpoint, pathParam, requestJson, services } from '../../route-utils';
import type { FolderCreateRequest } from '$lib/server/repository/types';
import { parseFolderCreateRequest } from '@archinsight/contracts';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    createFolder(event.cookies, services(event), pathParam(event, 'projectId'), await requestJson<FolderCreateRequest>(event, parseFolderCreateRequest))
  );

export const DELETE = (event) =>
  emptyEndpoint(event, () =>
    deleteFolder(event.cookies, services(event), pathParam(event, 'projectId'), event.url.searchParams.get('path') ?? '')
  );
