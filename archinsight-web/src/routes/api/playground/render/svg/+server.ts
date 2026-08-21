import { playgroundTree } from '$lib/server/publication/playground-project-service';
import { renderSvg } from '$lib/server/render/svg-renderer';
import type { SvgRenderRequest } from '$lib/server/language/types';
import { env, jsonEndpoint } from '../../../projects/route-utils';

export const POST = (event) => jsonEndpoint(event, async () => {
  const requestEnv = env(event);
  await playgroundTree(requestEnv);
  const request = await event.request.json() as SvgRenderRequest | null;
  return renderSvg(request?.renders, requestEnv, event.fetch);
});
