import type { TransactionalDatabase } from '$lib/server/database/types';
import { PostgresDatabaseProvider } from '$lib/server/database/postgres-database';
import { ProjectAnalysisCache } from '$lib/server/language/project-analysis-cache';
import { createPlaygroundPublicationStore } from '$lib/server/publication/playground-publication-store';
import type { PlaygroundPublicationStore } from '$lib/server/publication/types';
import { createRepositoryFileSystem } from '$lib/server/repository/repository-file-system';
import type { RepositoryFileSystem } from '$lib/server/repository/types';
import { parseApplicationConfig, type ApplicationConfig } from './application-config';
import { runtimeEnv, type EnvSource } from './local-config';

export interface ApplicationDatabase {
  get(): Promise<TransactionalDatabase>;
  dispose(): Promise<void>;
}

export type ApplicationServices = Readonly<{
  env: EnvSource;
  config: ApplicationConfig;
  database: ApplicationDatabase;
  repository: RepositoryFileSystem;
  publicationStore: PlaygroundPublicationStore;
  analysisCache: ProjectAnalysisCache;
  dispose(): Promise<void>;
}>;

export type ApplicationServiceOverrides = {
  database?: ApplicationDatabase;
  repository?: RepositoryFileSystem;
  publicationStore?: PlaygroundPublicationStore;
  analysisCache?: ProjectAnalysisCache;
};

export function createApplicationServices(
  env?: EnvSource,
  overrides: ApplicationServiceOverrides = {}
): ApplicationServices {
  const resolvedEnv = runtimeEnv(env);
  const config = parseApplicationConfig(resolvedEnv);
  const database = overrides.database ?? new PostgresDatabaseProvider(config.database);
  const getDatabase = () => database.get();
  const repository = overrides.repository ?? createRepositoryFileSystem(config, getDatabase);
  const publicationStore = overrides.publicationStore ?? createPlaygroundPublicationStore(config, getDatabase);
  const analysisCache = overrides.analysisCache ?? new ProjectAnalysisCache(config.analysisCache);
  let disposed = false;

  return Object.freeze({
    env: Object.freeze({ ...resolvedEnv }),
    config,
    database,
    repository,
    publicationStore,
    analysisCache,
    async dispose() {
      if (disposed) return;
      disposed = true;
      analysisCache.clear();
      await database.dispose();
    }
  });
}
