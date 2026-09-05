import { renderSvg } from '$lib/server/render/svg-renderer';
import { tree } from '$lib/server/repository/project-file-service';
import { jsonEndpoint, pathParam, requestJson, services } from '../../../route-utils';
import type { SvgRenderRequest } from '$lib/server/language/types';
import { parseSvgRenderRequest } from '@archinsight/contracts';

export const POST = (event) =>
  jsonEndpoint(event, async () => {
    const requestServices = services(event);
    await tree(event.cookies, requestServices, pathParam(event, 'projectId'));
    const request = await requestJson<SvgRenderRequest>(event, parseSvgRenderRequest);
    return renderSvg(request?.renders, requestServices, event.fetch);
  });
