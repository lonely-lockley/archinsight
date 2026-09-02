import { renderSvg } from '$lib/server/render/svg-renderer';
import { tree } from '$lib/server/repository/project-file-service';
import { env, jsonEndpoint, pathParam, requestJson } from '../../../route-utils';
import type { SvgRenderRequest } from '$lib/server/language/types';

export const POST = (event) =>
  jsonEndpoint(event, async () => {
    const requestEnv = env(event);
    await tree(event.cookies, requestEnv, pathParam(event, 'projectId'));
    const request = await requestJson<SvgRenderRequest | null>(event);
    return renderSvg(request?.renders, requestEnv, event.fetch);
  });
