import { beforeEach, describe, expect, it } from 'vitest';
import { GET as symbols } from './[projectId]/symbols/+server';
import { POST as structure } from './[projectId]/structure/+server';
import { POST as link } from './[projectId]/link/+server';
import { POST as renderSvg } from './[projectId]/render/svg/+server';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { InMemoryRepositoryFileSystem } from '$lib/server/repository/in-memory-repository-file-system';
import { setRepositoryFileSystem } from '$lib/server/repository/repository-file-system';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';
const env = {
  ARCHINSIGHT_AUTH_TOKEN_SECRET: 'standalone-token-test-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};

describe('language API routes', () => {
  beforeEach(() => {
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
    const response = await renderSvg(
      event('/api/projects/project-1/render/svg', {
        openSourceIdentities: ['main.ai'],
        overlays: {},
        query: 'MATCH (node:System) WHERE node.sourceIdentity = $tab RETURN node'
      })
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.diagnostics.some((diagnostic: { level: string }) => diagnostic.level === 'ERROR')).toBe(false);
    expect(body.svgs).toHaveLength(1);
    expect(body.svgs[0].sourceIdentity).toBe('main.ai');
    expect(body.svgs[0].svg).toContain('<svg');
    expect(body.svgs[0].svg).toContain('App');
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
          openSourceIdentities: ['main.ai'],
          overlays: {},
          query: 'MATCH (node:System) WHERE node.sourceIdentity = $tab RETURN node'
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

function event(url: string, body?: unknown, envOverride: Record<string, string> = {}) {
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
