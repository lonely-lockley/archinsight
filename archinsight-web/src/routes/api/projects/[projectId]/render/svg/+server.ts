import { link } from '$lib/server/language/language-pipeline';
import { renderSvg } from '$lib/server/render/svg-renderer';
import { env, jsonEndpoint, pathParam } from '../../../route-utils';
import type { LinkRequest } from '$lib/server/language/types';

export const POST = (event) =>
  jsonEndpoint(event, async () => {
    const requestEnv = env(event);
    const linked = await link(
      event.cookies,
      requestEnv,
      pathParam(event, 'projectId'),
      (await event.request.json()) as LinkRequest | null
    );
    const rendered = await renderSvg(linked.renders, requestEnv, event.fetch);
    return {
      diagnostics: [...linked.diagnostics, ...rendered.diagnostics],
      svgs: rendered.svgs
    };
  });
