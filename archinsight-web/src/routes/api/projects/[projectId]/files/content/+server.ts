import { deleteFile, read, save } from '$lib/server/repository/project-file-service';
import { emptyEndpoint, jsonEndpoint, pathParam, requestJson, services } from '../../../route-utils';
import type { FileSaveRequest } from '$lib/server/repository/types';
import { parseFileSaveRequest } from '@archinsight/contracts';

export const GET = (event) =>
  jsonEndpoint(event, () =>
    read(event.cookies, services(event), pathParam(event, 'projectId'), event.url.searchParams.get('path') ?? '')
  );

export const PUT = (event) =>
  jsonEndpoint(event, async () =>
    save(
      event.cookies,
      services(event),
      pathParam(event, 'projectId'),
      event.url.searchParams.get('path') ?? '',
      await requestJson<FileSaveRequest>(event, parseFileSaveRequest)
    )
  );

export const DELETE = (event) =>
  emptyEndpoint(event, () =>
    deleteFile(event.cookies, services(event), pathParam(event, 'projectId'), event.url.searchParams.get('path') ?? '')
  );
