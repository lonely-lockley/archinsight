import { getDatabaseConfig } from '$lib/server/database/database-config';
import { postgresDatabase } from '$lib/server/database/postgres-database';
import type { Queryable } from '$lib/server/database/types';
import type { EnvSource } from '$lib/server/auth/auth-config';
import { normalizeFileName } from '$lib/server/repository/path';
import { fileNodes, normalizeTree, requireFile, rootNode, toFileTreeDto } from '$lib/server/repository/repository-tree';
import { repositoryFileSystem } from '$lib/server/repository/repository-file-system';
import type { FileContentResponse, FileTreeResponse, RepositoryNode } from '$lib/server/repository/types';
import { currentPlaygroundPublication } from './playground-publication-service';

export type PlaygroundProjectSummary = { id: string; name: string };

export interface PlaygroundProjectStore {
  project(): Promise<PlaygroundProjectSummary>;
  tree(): Promise<FileTreeResponse>;
  read(path: string): Promise<FileContentResponse>;
  sources(): Promise<Map<string, string>>;
}

export async function playgroundProjectStore(env: EnvSource | undefined): Promise<PlaygroundProjectStore> {
  if (getDatabaseConfig(env).enabled) {
    return new PostgresPlaygroundProjectStore(await postgresDatabase(env));
  }
  return new InMemoryPlaygroundProjectStore(env);
}

class InMemoryPlaygroundProjectStore implements PlaygroundProjectStore {
  constructor(private readonly env: EnvSource | undefined) {}

  async project(): Promise<PlaygroundProjectSummary> {
    const publication = await requirePublication(this.env);
    const project = (await repositoryFileSystem(this.env).projects(publication.ownerId))
      .find((candidate) => candidate.id === publication.repositoryId);
    if (!project) {
      throw unavailable();
    }
    return project;
  }

  async tree(): Promise<FileTreeResponse> {
    const publication = await requirePublication(this.env);
    return repositoryFileSystem(this.env).tree(publication.ownerId, publication.repositoryId);
  }

  async read(path: string): Promise<FileContentResponse> {
    const publication = await requirePublication(this.env);
    const response = await repositoryFileSystem(this.env).read(publication.ownerId, publication.repositoryId, path);
    return { ...response, readOnly: false };
  }

  async sources(): Promise<Map<string, string>> {
    const publication = await requirePublication(this.env);
    return repositoryFileSystem(this.env).sources(publication.ownerId, publication.repositoryId);
  }
}

class PostgresPlaygroundProjectStore implements PlaygroundProjectStore {
  constructor(private readonly database: Queryable) {}

  async project(): Promise<PlaygroundProjectSummary> {
    const repository = await this.repository();
    return { id: repository.id, name: repository.name ?? repository.id };
  }

  async tree(): Promise<FileTreeResponse> {
    const repository = await this.repository();
    return { root: toFileTreeDto(repositoryTree(repository), '', repository.name ?? repository.id) };
  }

  async read(path: string): Promise<FileContentResponse> {
    const filePath = normalizeFileName(path);
    const repository = await this.repository();
    const node = requireFile(repositoryTree(repository), filePath);
    const result = await this.database.query<PublishedFileRow>(
      'select id, file_name, content, updated from public.playground_current_file where id = $1',
      [node.id]
    );
    const file = result.rows[0];
    if (!file) {
      throw new Error(`Published file content not found: ${filePath}`);
    }
    return {
      path: filePath,
      content: file.content ?? '',
      readOnly: false,
      revision: `${file.id}:${timestamp(file.updated)}`
    };
  }

  async sources(): Promise<Map<string, string>> {
    const repository = await this.repository();
    const rows = await this.database.query<PublishedFileRow>(
      'select id, file_name, content, updated from public.playground_current_file'
    );
    const byId = new Map(rows.rows.map((file) => [file.id, file]));
    const result = new Map<string, string>();
    for (const entry of fileNodes(repositoryTree(repository))) {
      if (!entry.path.endsWith('.ai')) {
        continue;
      }
      const file = byId.get(entry.node.id);
      if (file) {
        result.set(entry.path, file.content ?? '');
      }
    }
    return result;
  }

  private async repository(): Promise<PublishedRepositoryRow> {
    const result = await this.database.query<PublishedRepositoryRow>(
      'select id, name, structure from public.playground_current_repository'
    );
    const repository = result.rows[0];
    if (!repository) {
      throw unpublished();
    }
    return repository;
  }
}

type PublishedRepositoryRow = {
  id: string;
  name: string | null;
  structure: string | RepositoryNode | null;
};

type PublishedFileRow = {
  id: string;
  file_name: string;
  content: string | null;
  updated: Date | string | null;
};

function repositoryTree(repository: PublishedRepositoryRow): RepositoryNode {
  if (!repository.structure) {
    return rootNode();
  }
  const structure = typeof repository.structure === 'string'
    ? JSON.parse(repository.structure) as RepositoryNode
    : repository.structure;
  return normalizeTree(structure);
}

async function requirePublication(env: EnvSource | undefined) {
  const publication = await currentPlaygroundPublication(env);
  if (!publication) {
    throw unpublished();
  }
  return publication;
}

function unpublished(): Response {
  return new Response(JSON.stringify({ error: 'Playground project is not published' }), {
    status: 404,
    headers: { 'content-type': 'application/json' }
  });
}

function unavailable(): Response {
  return new Response(JSON.stringify({ error: 'Published playground project is unavailable' }), {
    status: 404,
    headers: { 'content-type': 'application/json' }
  });
}

function timestamp(value: Date | string | null): string {
  return value == null ? '0' : value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
