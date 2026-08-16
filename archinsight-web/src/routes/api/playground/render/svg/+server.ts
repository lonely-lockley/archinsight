import { playgroundLink } from '$lib/server/publication/playground-project-service';
import { renderSvg } from '$lib/server/render/svg-renderer';
import type { LinkRequest } from '$lib/server/language/types';
import { env, jsonEndpoint } from '../../../projects/route-utils';

export const POST = (event) => jsonEndpoint(event, async () => {
  const requestEnv = env(event);
  const linked = await playgroundLink(requestEnv, await event.request.json() as LinkRequest | null);
  const rendered = await renderSvg(linked.renders, requestEnv, event.fetch);
  return {
    diagnostics: [...linked.diagnostics, ...rendered.diagnostics],
    svgs: rendered.svgs
  };
});
