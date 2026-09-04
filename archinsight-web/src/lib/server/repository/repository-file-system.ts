import { InMemoryRepositoryFileSystem } from './in-memory-repository-file-system';
import { PostgresRepositoryFileSystem } from './postgres-repository-file-system';
import type {
  FileRenameRequest,
  FileSaveRequest,
  FolderCreateRequest,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  RepositoryFileSystem
} from './types';
import type { ApplicationConfig } from '$lib/server/config/application-config';
import type { TransactionalDatabase } from '$lib/server/database/types';

export function createRepositoryFileSystem(
  config: ApplicationConfig,
  database: () => Promise<TransactionalDatabase>
): RepositoryFileSystem {
  if (config.repositoryBackend === 'postgres') {
    return new LazyPostgresRepositoryFileSystem(database);
  }
  return new InMemoryRepositoryFileSystem([
    {
      id: 'default',
      name: 'Default',
      files: { 'archinsight.ai': '' }
    }
  ]);
}

export class LazyPostgresRepositoryFileSystem implements RepositoryFileSystem {
  private fileSystemPromise: Promise<PostgresRepositoryFileSystem> | undefined;

  constructor(private readonly database: () => Promise<TransactionalDatabase>) {}

  async projects(ownerId: string) {
    return (await this.fileSystem()).projects(ownerId);
  }

  async createProject(ownerId: string, request: ProjectCreateRequest | null) {
    return (await this.fileSystem()).createProject(ownerId, request);
  }

  async updateProject(ownerId: string, projectId: string, request: ProjectUpdateRequest | null) {
    return (await this.fileSystem()).updateProject(ownerId, projectId, request);
  }

  async deleteProject(ownerId: string, projectId: string) {
    return (await this.fileSystem()).deleteProject(ownerId, projectId);
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
    let fileSystem = this.fileSystemPromise;
    if (!fileSystem) {
      fileSystem = this.database().then((database) => new PostgresRepositoryFileSystem(database));
      this.fileSystemPromise = fileSystem;
      const pending = fileSystem;
      void pending.catch(() => {
        if (this.fileSystemPromise === pending) {
          this.fileSystemPromise = undefined;
        }
      });
    }
    return fileSystem;
  }
}
