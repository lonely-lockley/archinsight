import { beforeEach, describe, expect, it } from 'vitest';
import { GET as symbols } from './[projectId]/symbols/+server';
import { POST as structure } from './[projectId]/structure/+server';
import { POST as link } from './[projectId]/link/+server';
import { POST as renderSvg } from './[projectId]/render/svg/+server';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { InMemoryRepositoryFileSystem } from '$lib/server/repository/in-memory-repository-file-system';
import { setRepositoryFileSystem } from '$lib/server/repository/repository-file-system';
import { analysisMetricsSnapshot, resetAnalysisMetrics } from '$lib/server/language/analysis-observability';
import { resetProjectAnalysisCache } from '$lib/server/language/project-analysis-cache';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';
const env = {
  ARCHINSIGHT_DATABASE_ENABLED: 'false',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'memory',
  ARCHINSIGHT_AUTH_GHOST_ENABLED: 'false',
  ARCHINSIGHT_AUTH_TOKEN_SECRET: 'standalone-token-test-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};

describe('language API routes', () => {
  beforeEach(() => {
    resetProjectAnalysisCache();
    resetAnalysisMetrics();
    const fs = new InMemoryRepositoryFileSystem();
    fs.setProjects(ownerId, [
      {
        id: 'project-1',
        name: 'Project 1',
        files: {
          'main.ai': `
context demo

system app
    name = App
`
        }
      }
    ]);
    setRepositoryFileSystem(fs);
  });

  it('returns project symbols from the TypeScript language service', async () => {
    const response = await symbols(event('/api/projects/project-1/symbols'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.types.some((type: { name: string }) => type.name === 'System')).toBe(true);
    expect(body.constructors.some((constructor: { spelling: string }) => constructor.spelling === 'system')).toBe(true);
  });

  it('returns declaration structure with source metadata', async () => {
    const response = await structure(event('/api/projects/project-1/structure', { overlays: {} }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      schemaVersion: 'project-structure.v1',
      contexts: [
        {
          id: 'demo',
          source: 'main.ai',
          children: [
            {
              id: 'app',
              constructor: 'system',
              source: 'main.ai'
            }
          ]
        }
      ]
    });
  });

  it('links project sources and returns DOT renders', async () => {
    const response = await link(
      event('/api/projects/project-1/link', {
        openSourceIdentities: ['main.ai'],
        overlays: {},
        query: 'MATCH (node:System) WHERE node.sourceIdentity = $tab RETURN node'
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.diagnostics.some((diagnostic: { level: string }) => diagnostic.level === 'ERROR')).toBe(false);
    expect(body.renders).toHaveLength(1);
    expect(body.renders[0].sourceIdentity).toBe('main.ai');
    expect(body.renders[0].dot).toContain('digraph "demo"');
    expect(body.renders[0].dot).toContain('App');
    expect(body.symbols.types.some((type: { name: string }) => type.name === 'System')).toBe(true);
    expect(body.revision).toEqual(expect.any(String));
    expect(body.linkedModel.graph.nodes.some((node: { id: string }) => node.id === 'demo/app')).toBe(true);
  });

  it('reuses one linked revision when only the diagram query changes', async () => {
    const first = await link(event('/api/projects/project-1/link', {
      openSourceIdentities: ['main.ai'],
      overlays: {},
      query: 'MATCH (node:System) RETURN node'
    }));
    const second = await link(event('/api/projects/project-1/link', {
      openSourceIdentities: ['main.ai'],
      overlays: {},
      query: 'MATCH (node:Element) RETURN node'
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ analysis: { mode: 'cache-hit' } });
    expect(analysisMetricsSnapshot()).toMatchObject({ fullSnapshotBuilds: 1, fullProjectLinks: 1, cacheHits: 1 });
  });

  it('reuses one linked revision when only the deployment environment changes', async () => {
    const first = await link(event('/api/projects/project-1/link', {
      openSourceIdentities: ['main.ai'],
      overlays: {},
      view: 'deployment-container',
      environment: 'eu_central'
    }));
    const second = await link(event('/api/projects/project-1/link', {
      openSourceIdentities: ['main.ai'],
      overlays: {},
      view: 'deployment-container',
      environment: 'eu_west'
    }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({ analysis: { mode: 'cache-hit' } });
    expect(analysisMetricsSnapshot()).toMatchObject({ fullSnapshotBuilds: 1, fullProjectLinks: 1, cacheHits: 1 });
  });

  it('links constructors declared in another project source', async () => {
    const response = await link(
      event('/api/projects/project-1/link', {
        openSourceIdentities: ['main.ai'],
        overlays: {
          'definitions.ai': `
define type CloudEnvironment of BoundaryElement
    constructor cloudEnvironment

    required Text name
`,
          'main.ai': `
context infra

cloudEnvironment do
    name = Digitalocean
`
        },
        query: 'MATCH (node:CloudEnvironment) WHERE node.sourceIdentity = $tab RETURN node'
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'CONSTRUCTOR_NOT_DECLARED' }));
    expect(body.renders[0].dot).toContain('Digitalocean');
  });

  it('renders linked project DOT to SVG', async () => {
    let rendererRequest: { authorization: string | null; dot: string } | undefined;
    const response = await renderSvg(
      event(
        '/api/projects/project-1/render/svg',
        {
          renders: [{ sourceIdentity: 'main.ai', diagram: 'query', dot: 'digraph "demo" { app [label="App"] }' }]
        },
        {
          ARCHINSIGHT_RENDERER_ENABLED: 'true',
          ARCHINSIGHT_RENDERER_URL: 'http://renderer.internal:3000',
          ARCHINSIGHT_RENDERER_TOKEN: 'language-route-renderer-token'
        },
        async (_input, init) => {
          const payload = JSON.parse(String(init?.body)) as { renders: Array<{ sourceIdentity: string; diagram: string; dot: string }> };
          rendererRequest = {
            authorization: new Headers(init?.headers).get('authorization'),
            dot: payload.renders[0].dot
          };
          return new Response(JSON.stringify({
            diagnostics: [],
            svgs: [{ sourceIdentity: 'main.ai', diagram: 'query', svg: '<svg><text>App</text></svg>' }],
            warnings: []
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
      )
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.diagnostics.some((diagnostic: { level: string }) => diagnostic.level === 'ERROR')).toBe(false);
    expect(body.svgs).toHaveLength(1);
    expect(body.svgs[0].sourceIdentity).toBe('main.ai');
    expect(body.svgs[0].svg).toContain('<svg');
    expect(body.svgs[0].svg).toContain('App');
    expect(rendererRequest).toMatchObject({ authorization: 'Bearer language-route-renderer-token' });
    expect(rendererRequest?.dot).toContain('digraph "demo"');
    expect(analysisMetricsSnapshot().fullProjectLinks).toBe(0);
  });

  it('does not use an external renderer when the optional fallback is disabled', async () => {
    const response = await renderSvg(
      event('/api/projects/project-1/render/svg', {
        renders: [{ sourceIdentity: 'main.ai', diagram: 'query', dot: 'digraph "demo" { app }' }]
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.svgs).toEqual([]);
    expect(body.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EXTERNAL_RENDERER_DISABLED', level: 'ERROR' })
    ]));
  });

  it('rejects queries over the configured character limit', async () => {
    const response = await link(
      event(
        '/api/projects/project-1/link',
        {
          openSourceIdentities: ['main.ai'],
          overlays: {},
          query: 'MATCH (node:System) RETURN node'
        },
        {
          ARCHINSIGHT_LIMITS_MAX_QUERY_CHARS: '4'
        }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Query is too long' });
  });

  it('rejects overlay payloads over the configured byte limit', async () => {
    const response = await structure(
      event(
        '/api/projects/project-1/structure',
        {
          overlays: {
            'overlay.ai': 'context demo'
          }
        },
        {
          ARCHINSIGHT_LIMITS_MAX_OVERLAY_BYTES: '4'
        }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Overlay payload is too large' });
  });

  it('rejects server-side SVG rendering over the configured render count limit', async () => {
    const response = await renderSvg(
      event(
        '/api/projects/project-1/render/svg',
        {
          renders: [{ sourceIdentity: 'main.ai', diagram: 'query', dot: 'digraph "demo" { app }' }]
        },
        {
          ARCHINSIGHT_LIMITS_MAX_RENDER_COUNT: '0'
        }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Too many diagrams to render: 1' });
  });
});

function event(
  url: string,
  body?: unknown,
  envOverride: Record<string, string> = {},
  fetcher?: typeof fetch
) {
  return {
    cookies: cookies({
      'archinsight-session': issueStandaloneToken(
        {
          id: ownerId,
          displayName: 'Owner',
          tokenVersion: 1
        },
        {
          secret: env.ARCHINSIGHT_AUTH_TOKEN_SECRET,
          issuer: 'archinsight',
          audience: 'archinsight-editor',
          ttlMinutes: 30
        }
      )
    }),
    params: { projectId: 'project-1' },
    request: {
      json: async () => body ?? null
    },
    fetch: fetcher,
    url: new URL(url, 'http://localhost'),
    platform: { env: { ...env, ...envOverride } }
  } as never;
}

function cookies(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get(name: string) {
      return values.get(name);
    }
  };
}
