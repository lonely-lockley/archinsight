import { describe, expect, it, beforeEach } from 'vitest';
import { GET as projects, POST as createProject } from './+server';
import { DELETE as deleteProject, PATCH as updateProject } from './[projectId]/+server';
import { GET as tree } from './[projectId]/files/+server';
import { GET as read, PUT as save } from './[projectId]/files/content/+server';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { InMemoryRepositoryFileSystem } from '$lib/server/repository/in-memory-repository-file-system';
import { createApplicationServices } from '$lib/server/config/application-services';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';
const env = {
  ARCHINSIGHT_DATABASE_ENABLED: 'false',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'memory',
  ARCHINSIGHT_AUTH_GHOST_ENABLED: 'false',
  ARCHINSIGHT_AUTH_TOKEN_SECRET: 'standalone-token-test-secret',
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};
let repository: InMemoryRepositoryFileSystem;

describe('repository API routes', () => {
  beforeEach(() => {
    repository = new InMemoryRepositoryFileSystem();
    repository.setProjects(ownerId, [
      {
        id: 'project-1',
        name: 'Project 1',
        files: {
          'main.ai': 'context demo'
        }
      }
    ]);
  });

  it('requires authentication', async () => {
    const response = await projects({ cookies: cookies(), locals: { services: appServices(env) } } as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  });

  it('lists projects for the authenticated user', async () => {
    const response = await projects(event());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      projects: [{ id: 'project-1', name: 'Project 1', fileCount: 1 }]
    });
  });

  it('requires authentication for project creation', async () => {
    const response = await createProject({
      cookies: cookies(),
      request: { json: async () => ({ name: 'Private project' }) },
      locals: { services: appServices(env) }
    } as never);
    expect(response.status).toBe(401);
  });

  it('creates a project only for the authenticated owner', async () => {
    const response = await createProject(event('/api/projects', 'project-1', { name: 'New project' }));
    expect(response.status).toBe(200);
    const created = await response.json();
    expect(created).toMatchObject({ name: 'New project', fileCount: 0 });
    await expect((await projects(event())).json()).resolves.toMatchObject({
      projects: expect.arrayContaining([expect.objectContaining({ id: created.id, name: 'New project' })])
    });
  });

  it('does not allow an authenticated user to read another owner project', async () => {
    const response = await tree(event(
      '/api/projects/project-1/files',
      'project-1',
      undefined,
      {},
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Repository not found: project-1', code: 'NOT_FOUND' });
  });

  it('renames and deletes only an owned project', async () => {
    const renamed = await updateProject(event('/api/projects/project-1', 'project-1', { name: 'Renamed project' }));
    expect(renamed.status).toBe(200);
    await expect(renamed.json()).resolves.toMatchObject({ id: 'project-1', name: 'Renamed project' });

    const foreign = await deleteProject(event(
      '/api/projects/project-1',
      'project-1',
      undefined,
      {},
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    ));
    expect(foreign.status).toBe(404);

    const deleted = await deleteProject(event('/api/projects/project-1', 'project-1'));
    expect(deleted.status).toBe(200);
    await expect((await projects(event())).json()).resolves.toMatchObject({ projects: [] });
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

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: 'File content is too large', code: 'PAYLOAD_TOO_LARGE' });
  });

  it('reports duplicate project names as conflicts', async () => {
    const response = await createProject(event('/api/projects', 'project-1', { name: 'Project 1' }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'Project already exists: Project 1', code: 'CONFLICT' });
  });
});

function event(url = '/api/projects', projectId = 'project-1', body?: unknown, envOverride: Record<string, string> = {}, authenticatedOwnerId = ownerId) {
  return {
    cookies: cookies({
      'archinsight-session': issueStandaloneToken(
        {
          id: authenticatedOwnerId,
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
    locals: { services: appServices({ ...env, ...envOverride }) }
  } as never;
}

function appServices(source: Record<string, string>) {
  return createApplicationServices(source, { repository });
}

function cookies(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get(name: string) {
      return values.get(name);
    }
  };
}
