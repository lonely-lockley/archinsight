import { rename } from '$lib/server/repository/project-file-service';
import { env, jsonEndpoint, pathParam, requestJson } from '../../../route-utils';
import type { FileRenameRequest } from '$lib/server/repository/types';
import { parseFileRenameRequest } from '@archinsight/contracts';

export const POST = (event) =>
  jsonEndpoint(event, async () =>
    rename(event.cookies, env(event), pathParam(event, 'projectId'), await requestJson<FileRenameRequest>(event, parseFileRenameRequest))
  );
