import { beforeEach, describe, expect, it } from 'vitest';
import * as playgroundRoute from './+server';
import * as playgroundFilesRoute from './files/+server';
import * as playgroundContentRoute from './files/content/+server';
import * as playgroundSymbolsRoute from './symbols/+server';
import * as playgroundStructureRoute from './structure/+server';
import * as playgroundLinkRoute from './link/+server';
import * as playgroundRenderRoute from './render/svg/+server';
import * as projectsRoute from '../projects/+server';
import * as projectRoute from '../projects/[projectId]/+server';
import * as projectFilesRoute from '../projects/[projectId]/files/+server';
import * as projectContentRoute from '../projects/[projectId]/files/content/+server';
import * as projectFileRenameRoute from '../projects/[projectId]/files/rename/+server';
import * as projectFoldersRoute from '../projects/[projectId]/folders/+server';
import * as projectFolderRenameRoute from '../projects/[projectId]/folders/rename/+server';
import * as projectSymbolsRoute from '../projects/[projectId]/symbols/+server';
import * as projectStructureRoute from '../projects/[projectId]/structure/+server';
import * as projectLinkRoute from '../projects/[projectId]/link/+server';
import * as projectRenderRoute from '../projects/[projectId]/render/svg/+server';
import * as publicationRoute from '../admin/playground/publication/+server';
import { actionCatalog, canExecute, controlState } from '$lib/actions/action-model';
import type { AppCapability } from '$lib/api';
import { issueStandaloneToken } from '$lib/server/auth/standalone-token';
import { InMemoryRepositoryFileSystem } from '$lib/server/repository/in-memory-repository-file-system';
import {
  InMemoryPlaygroundPublicationStore
} from '$lib/server/publication/playground-publication-store';
import { createApplicationServices } from '$lib/server/config/application-services';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';
const foreignOwnerId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tokenSecret = 'playground-security-test-secret';
const playgroundEnv = {
  ARCHINSIGHT_RUNTIME_PROFILE: 'playground',
  ARCHINSIGHT_DATABASE_ENABLED: 'false',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'memory',
  ARCHINSIGHT_AUTH_GHOST_ENABLED: 'false',
  ARCHINSIGHT_AUTH_TOKEN_SECRET: tokenSecret,
  ARCHINSIGHT_AUTH_COOKIE_SECURE: 'false'
};
const editorEnv = { ...playgroundEnv, ARCHINSIGHT_RUNTIME_PROFILE: 'editor' };

let repository: InMemoryRepositoryFileSystem;
let publications: InMemoryPlaygroundPublicationStore;

describe('playground security boundary', () => {
  beforeEach(async () => {
    repository = new InMemoryRepositoryFileSystem();
    repository.setProjects(ownerId, [
      {
        id: 'published-project',
        name: 'Published project',
        files: { 'main.ai': 'context published' }
      },
      {
        id: 'private-project',
        name: 'Private project',
        files: { 'main.ai': 'context private_owner_secret' }
      }
    ]);
    repository.setProjects(foreignOwnerId, [
      {
        id: 'foreign-project',
        name: 'Foreign project',
        files: { 'main.ai': 'context foreign_owner_secret' }
      }
    ]);
    publications = new InMemoryPlaygroundPublicationStore();
    await publications.publish('default', ownerId, 'published-project', ownerId);
  });

  it('exposes only the published project and ignores caller-supplied project identifiers', async () => {
    const collection = await playgroundRoute.GET(playgroundEvent('/api/playground?projectId=foreign-project'));
    expect(collection.status).toBe(200);
    await expect(collection.json()).resolves.toEqual({
      projects: [expect.objectContaining({ id: 'published-project', name: 'Published project' })]
    });

    for (const requestedProjectId of ['private-project', 'foreign-project', 'does-not-exist']) {
      const response = await playgroundContentRoute.GET(
        playgroundEvent(`/api/playground/files/content?path=main.ai&projectId=${requestedProjectId}`)
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        path: 'main.ai',
        content: 'context published'
      });
    }
  });

  it('allows local overlays without persisting them to the published project', async () => {
    const response = await playgroundStructureRoute.POST(
      playgroundEvent('/api/playground/structure', undefined, {
        overlays: { 'main.ai': 'context local_overlay' }
      })
    );
    expect(response.status).toBe(200);

    await expect(repository.read(ownerId, 'published-project', 'main.ai')).resolves.toMatchObject({
      content: 'context published'
    });
  });

  it('has no filesystem or project mutation handlers under the playground API', () => {
    expectExportedMethods(playgroundRoute, ['GET']);
    expectExportedMethods(playgroundFilesRoute, ['GET']);
    expectExportedMethods(playgroundContentRoute, ['GET']);
    expectExportedMethods(playgroundSymbolsRoute, ['GET']);
    expectExportedMethods(playgroundStructureRoute, ['POST']);
    expectExportedMethods(playgroundLinkRoute, ['POST']);
    expectExportedMethods(playgroundRenderRoute, ['POST']);
  });

  it('rejects every editor repository route when served by the playground runtime', async () => {
    const attempts: Array<() => Response | Promise<Response>> = [
      () => projectsRoute.GET(playgroundEvent('/api/projects')),
      () => projectsRoute.POST(playgroundEvent('/api/projects', undefined, { name: 'Injected project' })),
      () => projectRoute.PATCH(playgroundEvent('/api/projects/foreign-project', 'foreign-project', { name: 'Hacked' })),
      () => projectRoute.DELETE(playgroundEvent('/api/projects/foreign-project', 'foreign-project')),
      () => projectFilesRoute.GET(playgroundEvent('/api/projects/foreign-project/files', 'foreign-project')),
      () => projectContentRoute.GET(playgroundEvent('/api/projects/foreign-project/files/content?path=main.ai', 'foreign-project')),
      () => projectContentRoute.PUT(playgroundEvent('/api/projects/foreign-project/files/content?path=main.ai', 'foreign-project', { content: 'hacked' })),
      () => projectContentRoute.DELETE(playgroundEvent('/api/projects/foreign-project/files/content?path=main.ai', 'foreign-project')),
      () => projectFileRenameRoute.POST(playgroundEvent('/api/projects/foreign-project/files/rename', 'foreign-project', { sourcePath: 'main.ai', targetPath: 'hacked.ai' })),
      () => projectFoldersRoute.POST(playgroundEvent('/api/projects/foreign-project/folders', 'foreign-project', { path: 'hacked' })),
      () => projectFoldersRoute.DELETE(playgroundEvent('/api/projects/foreign-project/folders?path=hacked', 'foreign-project')),
      () => projectFolderRenameRoute.POST(playgroundEvent('/api/projects/foreign-project/folders/rename', 'foreign-project', { sourcePath: 'source', targetPath: 'target' })),
      () => projectSymbolsRoute.GET(playgroundEvent('/api/projects/foreign-project/symbols', 'foreign-project')),
      () => projectStructureRoute.POST(playgroundEvent('/api/projects/foreign-project/structure', 'foreign-project', { overlays: {} })),
      () => projectLinkRoute.POST(playgroundEvent('/api/projects/foreign-project/link', 'foreign-project', { overlays: {} })),
      () => projectRenderRoute.POST(playgroundEvent('/api/projects/foreign-project/render/svg', 'foreign-project', { overlays: {} })),
      () => publicationRoute.GET(playgroundEvent('/api/admin/playground/publication')),
      () => publicationRoute.PUT(playgroundEvent('/api/admin/playground/publication', undefined, { projectId: 'foreign-project' })),
      () => publicationRoute.DELETE(playgroundEvent('/api/admin/playground/publication'))
    ];

    for (const attempt of attempts) {
      const response = await attempt();
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({ error: 'Not found', code: 'NOT_FOUND' });
    }

    await expect(repository.read(foreignOwnerId, 'foreign-project', 'main.ai')).resolves.toMatchObject({
      content: 'context foreign_owner_secret'
    });
    await expect(repository.projects(ownerId)).resolves.toHaveLength(2);
  });

  it('does not expose or mutate a foreign project through authenticated editor endpoints', async () => {
    const projectList = await projectsRoute.GET(editorEvent('/api/projects'));
    expect(projectList.status).toBe(200);
    const listed = await projectList.json() as { projects: Array<{ id: string }> };
    expect(listed.projects.map((project) => project.id).sort()).toEqual(['private-project', 'published-project']);

    const attempts: Array<() => Response | Promise<Response>> = [
      () => projectFilesRoute.GET(editorEvent('/api/projects/foreign-project/files', 'foreign-project')),
      () => projectContentRoute.GET(editorEvent('/api/projects/foreign-project/files/content?path=main.ai', 'foreign-project')),
      () => projectContentRoute.PUT(editorEvent('/api/projects/foreign-project/files/content?path=main.ai', 'foreign-project', { content: 'hacked' })),
      () => projectContentRoute.DELETE(editorEvent('/api/projects/foreign-project/files/content?path=main.ai', 'foreign-project')),
      () => projectFileRenameRoute.POST(editorEvent('/api/projects/foreign-project/files/rename', 'foreign-project', { sourcePath: 'main.ai', targetPath: 'hacked.ai' })),
      () => projectFoldersRoute.POST(editorEvent('/api/projects/foreign-project/folders', 'foreign-project', { path: 'hacked' })),
      () => projectFoldersRoute.DELETE(editorEvent('/api/projects/foreign-project/folders?path=hacked', 'foreign-project')),
      () => projectFolderRenameRoute.POST(editorEvent('/api/projects/foreign-project/folders/rename', 'foreign-project', { sourcePath: 'source', targetPath: 'target' })),
      () => projectSymbolsRoute.GET(editorEvent('/api/projects/foreign-project/symbols', 'foreign-project')),
      () => projectStructureRoute.POST(editorEvent('/api/projects/foreign-project/structure', 'foreign-project', { overlays: {} })),
      () => projectLinkRoute.POST(editorEvent('/api/projects/foreign-project/link', 'foreign-project', { overlays: {} })),
      () => projectRenderRoute.POST(editorEvent('/api/projects/foreign-project/render/svg', 'foreign-project', { overlays: {} })),
      () => projectRoute.PATCH(editorEvent('/api/projects/foreign-project', 'foreign-project', { name: 'Hacked' })),
      () => projectRoute.DELETE(editorEvent('/api/projects/foreign-project', 'foreign-project'))
    ];

    for (const attempt of attempts) {
      const response = await attempt();
      expect(response.status).toBe(404);
    }

    await expect(repository.read(foreignOwnerId, 'foreign-project', 'main.ai')).resolves.toMatchObject({
      content: 'context foreign_owner_secret'
    });
    await expect(repository.projects(foreignOwnerId)).resolves.toEqual([
      expect.objectContaining({ id: 'foreign-project', name: 'Foreign project', fileCount: 1 })
    ]);
  });

  it('blocks every persistent editor action on the playground surface even if capabilities are supplied', () => {
    const capabilities: AppCapability[] = [
      'repository:read-own',
      'repository:write-own',
      'publication:manage'
    ];
    const persistentActions = Object.entries(actionCatalog)
      .filter(([, action]) => action.effect === 'repository-write' || action.effect === 'publication-write');

    expect(persistentActions.length).toBeGreaterThan(0);
    for (const [actionId] of persistentActions) {
      const state = controlState(actionId as keyof typeof actionCatalog, {
        surface: 'playground',
        capabilities
      });
      expect(canExecute(state), actionId).toBe(false);
      expect(state.disabled, actionId).toBe(true);
    }
  });
});

function expectExportedMethods(module: object, expected: string[]): void {
  const methods = Object.keys(module).filter((name) => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(name));
  expect(methods.sort()).toEqual([...expected].sort());
}

function playgroundEvent(url: string, projectId?: string, body?: unknown) {
  return routeEvent(url, playgroundEnv, projectId, body, false);
}

function editorEvent(url: string, projectId?: string, body?: unknown) {
  return routeEvent(url, editorEnv, projectId, body, true);
}

function routeEvent(
  url: string,
  env: Record<string, string>,
  projectId: string | undefined,
  body: unknown,
  authenticated: boolean
) {
  const session = authenticated
    ? issueStandaloneToken(
        { id: ownerId, displayName: 'Owner', tokenVersion: 1 },
        { secret: tokenSecret, issuer: 'archinsight', audience: 'archinsight-editor', ttlMinutes: 30 }
      )
    : undefined;
  return {
    cookies: { get: (name: string) => name === 'archinsight-session' ? session : undefined },
    params: { projectId },
    request: { json: async () => body ?? null },
    url: new URL(url, 'http://localhost'),
    locals: {
      services: createApplicationServices(env, {
        repository,
        publicationStore: publications
      })
    }
  } as never;
}
