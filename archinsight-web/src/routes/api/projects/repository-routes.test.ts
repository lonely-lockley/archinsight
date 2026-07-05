import { describe, expect, it, beforeEach } from 'vitest';
import { GET as projects } from './+server';
import { GET as tree } from './[projectId]/files/+server';
import { GET as read, PUT as save } from './[projectId]/files/content/+server';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { InMemoryRepositoryFileSystem } from '$lib/server/repository/in-memory-repository-file-system';
import { setRepositoryFileSystem } from '$lib/server/repository/repository-file-system';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';
const env = {
  ARCHINSIGHT_AUTH_TOKEN_SECRET: 'standalone-token-test-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};

describe('repository API routes', () => {
  beforeEach(() => {
    const fs = new InMemoryRepositoryFileSystem();
    fs.setProjects(ownerId, [
      {
        id: 'project-1',
        name: 'Project 1',
        files: {
          'main.ai': 'context demo'
        }
      }
    ]);
    setRepositoryFileSystem(fs);
  });

  it('requires authentication', async () => {
    const response = await projects({ cookies: cookies(), platform: { env } } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required' });
  });

  it('lists projects for the authenticated user', async () => {
    const response = await projects(event());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      projects: [{ id: 'project-1', name: 'Project 1' }]
    });
  });

  it('reads, saves, and returns tree data through route handlers', async () => {
    await expect((await read(event('/api/projects/project-1/files/content?path=main', 'project-1'))).json()).resolves.toMatchObject({
      path: 'main.ai',
      content: 'context demo'
    });

    await save(event('/api/projects/project-1/files/content?path=main', 'project-1', { content: 'context changed' }));

    await expect((await read(event('/api/projects/project-1/files/content?path=main', 'project-1'))).json()).resolves.toMatchObject({
      path: 'main.ai',
      content: 'context changed'
    });
    await expect((await tree(event('/api/projects/project-1/files', 'project-1'))).json()).resolves.toMatchObject({
      root: {
        children: [{ name: 'main.ai', path: 'main.ai', type: 'file' }]
      }
    });
  });

  it('rejects file saves over the configured byte limit', async () => {
    const response = await save(
      event('/api/projects/project-1/files/content?path=main', 'project-1', { content: 'too large' }, {
        ARCHINSIGHT_LIMITS_MAX_FILE_BYTES: '4'
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'File content is too large' });
  });
});

function event(url = '/api/projects', projectId = 'project-1', body?: unknown, envOverride: Record<string, string> = {}) {
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
    params: { projectId },
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
