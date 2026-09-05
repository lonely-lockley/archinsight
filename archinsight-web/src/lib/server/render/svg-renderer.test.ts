import { describe, expect, it, vi } from 'vitest';
import { getRendererConfig } from './renderer-config';
import { renderSvg } from './svg-renderer';
import { createApplicationServices } from '$lib/server/config/application-services';

const renders = [{
  sourceIdentity: 'app.ai',
  diagram: 'query',
  dot: 'digraph app { a -> b }'
}];

const enabledEnv = {
  ARCHINSIGHT_RENDERER_ENABLED: 'true',
  ARCHINSIGHT_RENDERER_URL: 'http://renderer.internal:3000',
  ARCHINSIGHT_RENDERER_TOKEN: 'renderer-test-token'
};

describe('external SVG renderer adapter', () => {
  it('does not call an external renderer or run Graphviz when disabled by default', async () => {
    const fetcher = vi.fn();

    const response = await renderSvg(renders, createApplicationServices({ NODE_ENV: 'test' }), fetcher);

    expect(fetcher).not.toHaveBeenCalled();
    expect(response.svgs).toEqual([]);
    expect(response.diagnostics[0]).toMatchObject({
      source: 'app.ai',
      level: 'ERROR',
      code: 'EXTERNAL_RENDERER_DISABLED'
    });
    expect(getRendererConfig({
      ARCHINSIGHT_RENDERER_ENABLED: 'false',
      ARCHINSIGHT_RENDERER_URL: 'not a URL',
      ARCHINSIGHT_RENDERER_TIMEOUT_MS: 'invalid'
    }).enabled).toBe(false);
  });

  it('calls the configured renderer with service authentication', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      diagnostics: [],
      svgs: [{ sourceIdentity: 'app.ai', diagram: 'query', svg: '<svg width="10" height="10"/>' }],
      warnings: []
    }));

    const response = await renderSvg(renders, createApplicationServices(enabledEnv), fetcher);

    expect(response.diagnostics).toEqual([]);
    expect(response.svgs).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith('http://renderer.internal:3000/render/svg', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer renderer-test-token' }),
      redirect: 'error'
    }));
  });

  it('rejects oversized or mismatched renderer output', async () => {
    const oversized = await renderSvg(renders, createApplicationServices({
      ...enabledEnv,
      ARCHINSIGHT_RENDERER_MAX_SVG_BYTES: '8'
    }), async () => jsonResponse({
      svgs: [{ sourceIdentity: 'app.ai', diagram: 'query', svg: '<svg>too large</svg>' }]
    }));
    expect(oversized.svgs).toEqual([]);
    expect(oversized.diagnostics[0]).toMatchObject({ code: 'EXTERNAL_RENDERER_FAILED' });

    const mismatched = await renderSvg(renders, createApplicationServices(enabledEnv), async () => jsonResponse({
      svgs: [{ sourceIdentity: 'private.ai', diagram: 'query', svg: '<svg/>' }]
    }));
    expect(mismatched.svgs).toEqual([]);
    expect(mismatched.diagnostics[0].message).toContain('unexpected SVG');
  });

  it('fails configuration when an enabled renderer has no URL or token', () => {
    expect(() => getRendererConfig({ ARCHINSIGHT_RENDERER_ENABLED: 'true' }))
      .toThrow('ARCHINSIGHT_RENDERER_URL must be configured');
    expect(() => getRendererConfig({
      ARCHINSIGHT_RENDERER_ENABLED: 'true',
      ARCHINSIGHT_RENDERER_URL: 'http://renderer.internal:3000'
    })).toThrow('ARCHINSIGHT_RENDERER_TOKEN must be configured');
    expect(() => getRendererConfig({
      ARCHINSIGHT_RENDERER_ENABLED: 'true',
      ARCHINSIGHT_RENDERER_URL: 'http://renderer.internal:3000',
      ARCHINSIGHT_RENDERER_TOKEN: 'short'
    })).toThrow('ARCHINSIGHT_RENDERER_TOKEN must contain at least 16 characters');
    expect(() => getRendererConfig({ ARCHINSIGHT_RENDERER_ENABLED: 'ture' }))
      .toThrow('ARCHINSIGHT_RENDERER_ENABLED must be a boolean');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}
