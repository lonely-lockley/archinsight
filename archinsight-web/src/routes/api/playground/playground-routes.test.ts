import { beforeEach, describe, expect, it } from 'vitest';
import { GET as playground } from './+server';
import { GET as tree } from './files/+server';
import * as contentRoute from './files/content/+server';
import { InMemoryRepositoryFileSystem } from '$lib/server/repository/in-memory-repository-file-system';
import {
  InMemoryPlaygroundPublicationStore
} from '$lib/server/publication/playground-publication-store';
import { createApplicationServices } from '$lib/server/config/application-services';

const ownerId = '5913933c-2268-41e1-a558-622dc11f675a';
const env = {
  ARCHINSIGHT_RUNTIME_PROFILE: 'playground',
  ARCHINSIGHT_DATABASE_ENABLED: 'false',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'memory'
};
let publications: InMemoryPlaygroundPublicationStore;
let repository: InMemoryRepositoryFileSystem;

describe('playground API', () => {
  beforeEach(() => {
    repository = new InMemoryRepositoryFileSystem();
    repository.setProjects(ownerId, [{
      id: 'published-project',
      name: 'Published project',
      files: { 'main.ai': 'context published' }
    }]);
    publications = new InMemoryPlaygroundPublicationStore();
  });

  it('returns only the selected published project without authentication', async () => {
    await publications.publish('default', ownerId, 'published-project', ownerId);

    await expect((await playground(event('/api/playground'))).json()).resolves.toMatchObject({
      projects: [{ id: 'published-project', name: 'Published project', fileCount: 1 }]
    });
    await expect((await tree(event('/api/playground/files'))).json()).resolves.toMatchObject({
      root: { children: [{ name: 'main.ai', path: 'main.ai', type: 'file' }] }
    });
    await expect((await contentRoute.GET(event('/api/playground/files/content?path=main'))).json()).resolves.toMatchObject({
      path: 'main.ai',
      content: 'context published',
      readOnly: false
    });
  });

  it('does not expose mutation handlers', () => {
    expect('PUT' in contentRoute).toBe(false);
    expect('DELETE' in contentRoute).toBe(false);
  });

  it('returns 404 when no project is published', async () => {
    const response = await playground(event('/api/playground'));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Playground project is not published', code: 'NOT_FOUND' });
  });

  it('is unavailable from the editor-only runtime profile', async () => {
    await publications.publish('default', ownerId, 'published-project', ownerId);
    const response = await playground(event('/api/playground', { ARCHINSIGHT_RUNTIME_PROFILE: 'editor' }));
    expect(response.status).toBe(404);
  });
});

function event(url: string, override: Record<string, string> = {}) {
  return {
    cookies: { get: () => undefined },
    request: { json: async () => null },
    url: new URL(url, 'http://localhost'),
    locals: {
      services: createApplicationServices(
        { ...env, ...override },
        { repository, publicationStore: publications }
      )
    }
  } as never;
}
