import { describe, expect, it, vi } from 'vitest';
import { InMemoryRepositoryFileSystem } from '$lib/server/repository/in-memory-repository-file-system';
import { InMemoryPlaygroundPublicationStore } from '$lib/server/publication/playground-publication-store';
import { ProjectAnalysisCache } from '$lib/server/language/project-analysis-cache';
import { createApplicationServices, type ApplicationDatabase } from './application-services';

const testEnv = {
  NODE_ENV: 'test',
  ARCHINSIGHT_DATABASE_ENABLED: 'false',
  ARCHINSIGHT_REPOSITORY_BACKEND: 'memory'
};

describe('ApplicationServices', () => {
  it('owns isolated mutable services while sharing one immutable configuration', () => {
    const first = createApplicationServices(testEnv);
    const second = createApplicationServices(testEnv);

    expect(first).not.toBe(second);
    expect(first.repository).not.toBe(second.repository);
    expect(first.publicationStore).not.toBe(second.publicationStore);
    expect(first.analysisCache).not.toBe(second.analysisCache);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.config)).toBe(true);
    expect(Object.isFrozen(first.env)).toBe(true);
  });

  it('uses explicitly supplied ports without touching a database', async () => {
    const database = fakeDatabase();
    const repository = new InMemoryRepositoryFileSystem();
    const publicationStore = new InMemoryPlaygroundPublicationStore();
    const analysisCache = new ProjectAnalysisCache();
    const services = createApplicationServices(testEnv, {
      database,
      repository,
      publicationStore,
      analysisCache
    });

    expect(services).toMatchObject({ repository, publicationStore, analysisCache, database });
    expect(database.get).not.toHaveBeenCalled();
  });

  it('clears owned caches and disposes resources exactly once', async () => {
    const database = fakeDatabase();
    const analysisCache = new ProjectAnalysisCache();
    const clear = vi.spyOn(analysisCache, 'clear');
    const services = createApplicationServices(testEnv, { database, analysisCache });

    await services.dispose();
    await services.dispose();

    expect(clear).toHaveBeenCalledOnce();
    expect(database.dispose).toHaveBeenCalledOnce();
    expect(database.get).not.toHaveBeenCalled();
  });

  it('wires both Postgres-backed stores to the owned lazy database provider', async () => {
    const transactionalDatabase = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      transaction: vi.fn()
    };
    const database = {
      get: vi.fn().mockResolvedValue(transactionalDatabase),
      dispose: vi.fn().mockResolvedValue(undefined)
    };
    const services = createApplicationServices({
      ...testEnv,
      ARCHINSIGHT_DATABASE_ENABLED: 'true',
      ARCHINSIGHT_DATABASE_MIGRATIONS_ENABLED: 'false',
      ARCHINSIGHT_REPOSITORY_BACKEND: 'postgres',
      ARCHINSIGHT_AUTH_TOKEN_SECRET: 'application-services-test-secret'
    }, { database });

    await expect(services.repository.projects('owner')).resolves.toEqual([]);
    await expect(services.publicationStore.current()).resolves.toBeNull();

    expect(database.get).toHaveBeenCalledTimes(2);
    expect(transactionalDatabase.query).toHaveBeenCalledTimes(2);
  });
});

function fakeDatabase(): ApplicationDatabase & {
  get: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    get: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined)
  };
}
