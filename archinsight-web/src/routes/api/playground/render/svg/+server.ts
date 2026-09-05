import { playgroundTree } from '$lib/server/publication/playground-project-service';
import { renderSvg } from '$lib/server/render/svg-renderer';
import type { SvgRenderRequest } from '$lib/server/language/types';
import { parseSvgRenderRequest } from '@archinsight/contracts';
import { jsonEndpoint, requestJson, services } from '../../../projects/route-utils';

export const POST = (event) => jsonEndpoint(event, async () => {
  const requestServices = services(event);
  await playgroundTree(requestServices);
  const request = await requestJson<SvgRenderRequest>(event, parseSvgRenderRequest);
  return renderSvg(request?.renders, requestServices, event.fetch);
});
