import { baseName, normalizeFileName, parentDirectory } from './path';
import {
  addFileNode,
  ensureDirectory,
  findNode,
  normalizeTree,
  requireFile,
  rootNode,
  toFileTreeDto
} from './repository-tree';
import {
  createFolderNode,
  deleteFileNode,
  deleteFolderNode,
  normalizedFileSave,
  projectDisplayName,
  projectSummary,
  projectNameInput,
  renameFileNode,
  renameFolderNode,
  saveFileNode,
  sortProjectSummaries,
  sourceFileNodes
} from './repository-domain';
import { randomUUID } from 'node:crypto';
import type { Queryable, TransactionalDatabase } from '$lib/server/database/types';
import { conflict, notFound } from '$lib/server/errors/application-error';
import type {
  FileContentResponse,
  FileOperationResponse,
  FileRenameRequest,
  FileSaveRequest,
  FileTreeResponse,
  FolderCreateRequest,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ProjectSummaryResponse,
  RepositoryFileSystem,
  RepositoryNode
} from './types';

type RepositoryRow = {
  id: string;
  owner_id: string;
  name: string | null;
  structure: string | RepositoryNode | null;
  created?: Date | string | null;
  updated?: Date | string | null;
  file_count?: number | string | null;
};

type RepositoryFileRow = {
  id: string;
  owner_id: string;
  repository_id: string;
  file_name: string;
  content: string | null;
  level: string | null;
  project_identifier: string | null;
  updated: Date | string | null;
};

export class PostgresRepositoryFileSystem implements RepositoryFileSystem {
  constructor(private readonly database: TransactionalDatabase) {}

  async projects(ownerId: string): Promise<ProjectSummaryResponse[]> {
    const result = await this.database.query<RepositoryRow>(
      `
        select r.id, r.name, r.created,
               greatest(r.updated, coalesce(max(f.updated), r.updated)) as updated,
               count(f.id)::integer as file_count
        from public.repository r
        left join public.file f on f.repository_id = r.id and f.owner_id = r.owner_id
        where r.owner_id = $1
        group by r.id
        order by greatest(r.updated, coalesce(max(f.updated), r.updated)) desc, r.name
      `,
      [ownerId]
    );
    return sortProjectSummaries(result.rows.map(toProjectSummary));
  }

  async createProject(ownerId: string, request: ProjectCreateRequest | null): Promise<ProjectSummaryResponse> {
    const name = projectNameInput(request?.name);
    return this.database.transaction(async (client) => {
      const duplicate = await client.query('select id from public.repository where owner_id = $1 and lower(name) = lower($2)', [ownerId, name]);
      if (duplicate.rows.length > 0) {
        throw conflict(`Project already exists: ${name}`);
      }
      const id = randomUUID();
      const structure = rootNode();
      const result = await client.query<RepositoryRow>(
        `insert into public.repository (id, owner_id, name, structure)
         values ($1, $2, $3, $4::json)
         returning id, name, created, updated`,
        [id, ownerId, name, JSON.stringify(structure)]
      );
      return toProjectSummary({ ...result.rows[0], file_count: 0 });
    });
  }

  async updateProject(ownerId: string, projectId: string, request: ProjectUpdateRequest | null): Promise<ProjectSummaryResponse> {
    const name = projectNameInput(request?.name);
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const duplicate = await client.query(
        'select id from public.repository where owner_id = $1 and lower(name) = lower($2) and id <> $3',
        [ownerId, name, repository.id]
      );
      if (duplicate.rows.length > 0) {
        throw conflict(`Project already exists: ${name}`);
      }
      const result = await client.query<RepositoryRow>(
        `update public.repository
         set name = $3, updated = now()
         where owner_id = $1 and id = $2
         returning id, name, created, updated`,
        [ownerId, repository.id, name]
      );
      requireChanged(result.rowCount, `Project was not updated: ${projectId}`);
      const fileCount = await client.query<{ file_count: number | string }>(
        'select count(*)::integer as file_count from public.file where owner_id = $1 and repository_id = $2',
        [ownerId, repository.id]
      );
      return toProjectSummary({ ...result.rows[0], file_count: fileCount.rows[0]?.file_count ?? 0 });
    });
  }

  async deleteProject(ownerId: string, projectId: string): Promise<void> {
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      await client.query('delete from public.file where owner_id = $1 and repository_id = $2', [ownerId, repository.id]);
      const deleted = await client.query('delete from public.repository where owner_id = $1 and id = $2', [ownerId, repository.id]);
      requireChanged(deleted.rowCount, `Project was not deleted: ${projectId}`);
    });
  }

  async tree(ownerId: string, projectId: string): Promise<FileTreeResponse> {
    const repository = await this.requireRepository(this.database, ownerId, projectId);
    const root = await this.loadTree(this.database, ownerId, repository);
    return { root: toFileTreeDto(root, '', projectDisplayName(repository.id, repository.name)) };
  }

  async read(ownerId: string, projectId: string, path: string): Promise<FileContentResponse> {
    const filePath = normalizeFileName(path);
    const repository = await this.requireRepository(this.database, ownerId, projectId);
    const root = await this.loadTree(this.database, ownerId, repository);
    const node = requireFile(root, filePath);
    const file = await this.findFileById(this.database, ownerId, repository.id, node.id);
    if (!file) {
      throw notFound(`Repository file content not found: ${filePath}`);
    }
    return {
      path: filePath,
      content: file.content ?? '',
      readOnly: false,
      revision: revision(file)
    };
  }

  async save(
    ownerId: string,
    projectId: string,
    path: string,
    request: FileSaveRequest | null
  ): Promise<FileOperationResponse> {
    const filePath = normalizeFileName(path);
    const { content, level, projectIdentifier } = normalizedFileSave(request);

    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const { node } = saveFileNode(root, filePath);
      const current = await this.findFileById(client, ownerId, repository.id, node.id);
      if (current) {
        const changed = await client.query(
          `
            update public.file
            set content = $4,
                level = $5,
                project_identifier = $6,
                updated = now()
            where owner_id = $1
              and repository_id = $2
              and id = $3
          `,
          [ownerId, repository.id, node.id, content, level, projectIdentifier]
        );
        requireChanged(changed.rowCount, `Repository file was not saved: ${filePath}`);
      } else {
        const changed = await client.query(
          `
            insert into public.file (id, owner_id, repository_id, file_name, content, level, project_identifier)
            values ($1, $2, $3, $4, $5, $6, $7)
          `,
          [node.id, ownerId, repository.id, node.name, content, level, projectIdentifier]
        );
        requireChanged(changed.rowCount, `Repository file was not saved: ${filePath}`);
      }
      await this.saveTree(client, ownerId, repository.id, root);
      const saved = await this.findFileById(client, ownerId, repository.id, node.id);
      if (!saved) {
        throw new Error(`Repository file was not saved: ${filePath}`);
      }
      return { path: filePath, revision: revision(saved) };
    });
  }

  async rename(ownerId: string, projectId: string, request: FileRenameRequest | null): Promise<FileOperationResponse> {
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const { path: targetPath, node: source } = renameFileNode(root, request);
      const changed = await client.query(
        `
          update public.file
          set file_name = $4,
              updated = now()
          where owner_id = $1
            and repository_id = $2
            and id = $3
        `,
        [ownerId, repository.id, source.id, source.name]
      );
      requireChanged(changed.rowCount, `Repository file was not renamed: ${request?.sourcePath ?? ''}`);
      await this.saveTree(client, ownerId, repository.id, root);
      const renamed = await this.findFileById(client, ownerId, repository.id, source.id);
      if (!renamed) {
        throw new Error(`Repository file was not renamed: ${request?.sourcePath ?? ''}`);
      }
      return { path: targetPath, revision: revision(renamed) };
    });
  }

  async delete(ownerId: string, projectId: string, path: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const { path: filePath, node } = deleteFileNode(root, path);
      const changed = await client.query(
        `
          delete from public.file
          where owner_id = $1
            and repository_id = $2
            and id = $3
        `,
        [ownerId, repository.id, node.id]
      );
      requireChanged(changed.rowCount, `Repository file content not found: ${filePath}`);
      await this.saveTree(client, ownerId, repository.id, root);
    });
  }

  async createFolder(
    ownerId: string,
    projectId: string,
    request: FolderCreateRequest | null
  ): Promise<FileOperationResponse> {
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const { path: folderPath } = createFolderNode(root, request);
      await this.saveTree(client, ownerId, repository.id, root);
      return { path: folderPath, revision: `tree:${folderPath}` };
    });
  }

  async renameFolder(ownerId: string, projectId: string, request: FileRenameRequest | null): Promise<FileOperationResponse> {
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const { path: targetPath } = renameFolderNode(root, request);
      await this.saveTree(client, ownerId, repository.id, root);
      return { path: targetPath, revision: `tree:${targetPath}` };
    });
  }

  async deleteFolder(ownerId: string, projectId: string, path: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const { path: folderPath, fileIds: ids } = deleteFolderNode(root, path);
      if (ids.length > 0) {
        const changed = await client.query(
          `
            delete from public.file
            where owner_id = $1
              and repository_id = $2
              and id = any($3::uuid[])
          `,
          [ownerId, repository.id, ids]
        );
        if ((changed.rowCount ?? 0) !== ids.length) {
          throw new Error(`Repository folder content was not fully deleted: ${folderPath}`);
        }
      }
      await this.saveTree(client, ownerId, repository.id, root);
    });
  }

  async sources(ownerId: string, projectId: string): Promise<Map<string, string>> {
    const repository = await this.requireRepository(this.database, ownerId, projectId);
    const root = await this.loadTree(this.database, ownerId, repository);
    const result = new Map<string, string>();
    for (const entry of sourceFileNodes(root)) {
      const file = await this.findFileById(this.database, ownerId, repository.id, entry.node.id);
      if (file) {
        result.set(entry.path, file.content ?? '');
      }
    }
    return result;
  }

  private async requireRepository(
    client: Queryable,
    ownerId: string,
    projectId: string,
    forUpdate = false
  ): Promise<RepositoryRow> {
    const repository = await this.resolveRepository(client, ownerId, projectId, forUpdate);
    if (!repository) {
      throw notFound(`Repository not found: ${projectId}`);
    }
    return repository;
  }

  private async resolveRepository(
    client: Queryable,
    ownerId: string,
    projectId: string,
    forUpdate: boolean
  ): Promise<RepositoryRow | null> {
    const normalized = projectId.trim();
    if (normalized === '') {
      return null;
    }
    if (isUuid(normalized)) {
      const result = await client.query<RepositoryRow>(
        `
          select id, owner_id, name, structure
          from public.repository
          where owner_id = $1
            and id = $2
          ${forUpdate ? 'for update' : ''}
        `,
        [ownerId, normalized]
      );
      return result.rows[0] ?? null;
    }
    const result = await client.query<RepositoryRow>(
      `
        select id, owner_id, name, structure
        from public.repository
        where owner_id = $1
          and name = $2
        order by updated desc
        limit 1
        ${forUpdate ? 'for update' : ''}
      `,
      [ownerId, normalized]
    );
    return result.rows[0] ?? null;
  }

  private async loadTree(client: Queryable, ownerId: string, repository: RepositoryRow): Promise<RepositoryNode> {
    if (repository.structure) {
      return normalizeTree(readStructure(repository.structure));
    }
    return rebuildTreeFromFiles(await this.listFiles(client, ownerId, repository.id));
  }

  private async listFiles(client: Queryable, ownerId: string, repositoryId: string): Promise<RepositoryFileRow[]> {
    const result = await client.query<RepositoryFileRow>(
      `
        select id, owner_id, repository_id, file_name, content, level, project_identifier, updated
        from public.file
        where owner_id = $1
          and repository_id = $2
        order by file_name
      `,
      [ownerId, repositoryId]
    );
    return result.rows;
  }

  private async findFileById(
    client: Queryable,
    ownerId: string,
    repositoryId: string,
    fileId: string
  ): Promise<RepositoryFileRow | null> {
    const result = await client.query<RepositoryFileRow>(
      `
        select id, owner_id, repository_id, file_name, content, level, project_identifier, updated
        from public.file
        where owner_id = $1
          and repository_id = $2
          and id = $3
      `,
      [ownerId, repositoryId, fileId]
    );
    return result.rows[0] ?? null;
  }

  private async saveTree(client: Queryable, ownerId: string, repositoryId: string, root: RepositoryNode): Promise<void> {
    const changed = await client.query(
      `
        update public.repository
        set structure = $3::json,
            updated = now()
        where owner_id = $1
          and id = $2
      `,
      [ownerId, repositoryId, JSON.stringify(root)]
    );
    requireChanged(changed.rowCount, `Repository structure was not saved: ${repositoryId}`);
  }
}

function rebuildTreeFromFiles(files: RepositoryFileRow[]): RepositoryNode {
  const root = rootNode();
  for (const file of files) {
    if (!file.file_name || file.file_name.trim() === '') {
      continue;
    }
    const path = normalizeFileName(file.file_name);
    const parent = ensureDirectory(root, parentDirectory(path));
    const node = findNode(root, path) ?? addFileNode(root, path);
    node.id = file.id;
    node.name = baseName(path);
    node.parentId = parent.id;
  }
  return normalizeTree(root);
}

function readStructure(value: string | RepositoryNode): RepositoryNode {
  if (typeof value === 'string') {
    return JSON.parse(value) as RepositoryNode;
  }
  return value;
}

function toProjectSummary(repository: RepositoryRow): ProjectSummaryResponse {
  return projectSummary({
    id: repository.id,
    name: repository.name,
    created: repository.created,
    updated: repository.updated,
    fileCount: Number(repository.file_count ?? 0)
  });
}

function requireChanged(rowCount: number | null, message: string): void {
  if (rowCount !== 1) {
    throw new Error(message);
  }
}

function revision(file: RepositoryFileRow): string {
  const updated = file.updated == null ? '' : String(file.updated);
  return `db:${file.id}:${updated}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
