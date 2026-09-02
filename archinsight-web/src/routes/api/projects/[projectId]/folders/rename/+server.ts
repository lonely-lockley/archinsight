import { renameFolder } from '$lib/server/repository/project-file-service';
import { env, jsonEndpoint, pathParam, requestJson } from '../../../route-utils';
import type { FileRenameRequest } from '$lib/server/repository/types';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    renameFolder(event.cookies, env(event), pathParam(event, 'projectId'), await requestJson<FileRenameRequest | null>(event))
  );
