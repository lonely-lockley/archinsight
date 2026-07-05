import { InMemoryRepositoryFileSystem } from './in-memory-repository-file-system';
import { PostgresRepositoryFileSystem } from './postgres-repository-file-system';
import { postgresDatabase } from '$lib/server/database/postgres-database';
import type {
  FileRenameRequest,
  FileSaveRequest,
  FolderCreateRequest,
  RepositoryFileSystem
} from './types';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { runtimeEnv } from '$lib/server/config/local-config';

let currentRepositoryFileSystem: RepositoryFileSystem = new InMemoryRepositoryFileSystem([
  {
    id: 'default',
    name: 'Default',
    files: {
      'archinsight.ai': ''
    }
  }
]);
const postgresFileSystems = new Map<string, RepositoryFileSystem>();

export function repositoryFileSystem(env?: EnvSource): RepositoryFileSystem {
  const source = runtimeEnv(env);
  if ((source.ARCHINSIGHT_REPOSITORY_BACKEND ?? 'memory').toLowerCase() === 'postgres') {
    return postgresRepositoryFileSystem(env);
  }
  return currentRepositoryFileSystem;
}

export function setRepositoryFileSystem(fileSystem: RepositoryFileSystem): void {
  currentRepositoryFileSystem = fileSystem;
}

function postgresRepositoryFileSystem(env?: EnvSource): RepositoryFileSystem {
  const source = runtimeEnv(env);
  const key = JSON.stringify({
    url: source.ARCHINSIGHT_DATABASE_URL,
    host: source.ARCHINSIGHT_DATABASE_HOST,
    port: source.ARCHINSIGHT_DATABASE_PORT,
    database: source.ARCHINSIGHT_DATABASE_NAME,
    user: source.ARCHINSIGHT_DATABASE_USER
  });
  let fileSystem = postgresFileSystems.get(key);
  if (!fileSystem) {
    fileSystem = new LazyPostgresRepositoryFileSystem(env);
    postgresFileSystems.set(key, fileSystem);
  }
  return fileSystem;
}

class LazyPostgresRepositoryFileSystem implements RepositoryFileSystem {
  private fileSystemPromise: Promise<PostgresRepositoryFileSystem> | undefined;

  constructor(private readonly env: EnvSource | undefined) {}

  async projects(ownerId: string) {
    return (await this.fileSystem()).projects(ownerId);
  }

  async tree(ownerId: string, projectId: string) {
    return (await this.fileSystem()).tree(ownerId, projectId);
  }

  async read(ownerId: string, projectId: string, path: string) {
    return (await this.fileSystem()).read(ownerId, projectId, path);
  }

  async save(ownerId: string, projectId: string, path: string, request: FileSaveRequest | null) {
    return (await this.fileSystem()).save(ownerId, projectId, path, request);
  }

  async rename(ownerId: string, projectId: string, request: FileRenameRequest | null) {
    return (await this.fileSystem()).rename(ownerId, projectId, request);
  }

  async delete(ownerId: string, projectId: string, path: string) {
    return (await this.fileSystem()).delete(ownerId, projectId, path);
  }

  async createFolder(ownerId: string, projectId: string, request: FolderCreateRequest | null) {
    return (await this.fileSystem()).createFolder(ownerId, projectId, request);
  }

  async renameFolder(ownerId: string, projectId: string, request: FileRenameRequest | null) {
    return (await this.fileSystem()).renameFolder(ownerId, projectId, request);
  }

  async deleteFolder(ownerId: string, projectId: string, path: string) {
    return (await this.fileSystem()).deleteFolder(ownerId, projectId, path);
  }

  async sources(ownerId: string, projectId: string) {
    return (await this.fileSystem()).sources(ownerId, projectId);
  }

  private async fileSystem(): Promise<PostgresRepositoryFileSystem> {
    this.fileSystemPromise ??= postgresDatabase(this.env).then((database) => new PostgresRepositoryFileSystem(database));
    return this.fileSystemPromise;
  }
}
