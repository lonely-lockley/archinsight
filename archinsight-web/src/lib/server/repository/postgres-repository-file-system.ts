import {
  baseName,
  normalizeDirectoryPath,
  normalizeFileName,
  parentDirectory
} from './path';
import {
  addDirectoryNode,
  addFileNode,
  ensureDirectory,
  fileIds,
  fileNodes,
  findNode,
  moveNode,
  normalizeTree,
  removeNode,
  requireDirectory,
  requireFile,
  rootNode,
  toFileTreeDto
} from './repository-tree';
import type { Queryable, TransactionalDatabase } from '$lib/server/database/types';
import type {
  FileContentResponse,
  FileOperationResponse,
  FileRenameRequest,
  FileSaveRequest,
  FileTreeResponse,
  FolderCreateRequest,
  ProjectSummaryResponse,
  RepositoryFileSystem,
  RepositoryNode
} from './types';

type RepositoryRow = {
  id: string;
  owner_id: string;
  name: string | null;
  structure: string | RepositoryNode | null;
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
    const result = await this.database.query<Pick<RepositoryRow, 'id' | 'name'>>(
      `
        select id, name
        from public.repository
        where owner_id = $1
        order by updated desc, name
      `,
      [ownerId]
    );
    return result.rows.map((row) => ({ id: row.id, name: projectName(row) }));
  }

  async tree(ownerId: string, projectId: string): Promise<FileTreeResponse> {
    const repository = await this.requireRepository(this.database, ownerId, projectId);
    const root = await this.loadTree(this.database, ownerId, repository);
    return { root: toFileTreeDto(root, '', projectName(repository)) };
  }

  async read(ownerId: string, projectId: string, path: string): Promise<FileContentResponse> {
    const filePath = normalizeFileName(path);
    const repository = await this.requireRepository(this.database, ownerId, projectId);
    const root = await this.loadTree(this.database, ownerId, repository);
    const node = requireFile(root, filePath);
    const file = await this.findFileById(this.database, ownerId, repository.id, node.id);
    if (!file) {
      throw new Error(`Repository file content not found: ${filePath}`);
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
    const content = request?.content ?? '';
    const level = nullableText(request?.level, 50, 'level');
    const projectIdentifier = nullableText(request?.projectIdentifier, 50, 'projectIdentifier');

    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const existing = findNode(root, filePath);
      if (existing?.type === 'd') {
        throw new Error(`Repository folder already exists: ${filePath}`);
      }
      const node = existing ?? addFileNode(root, filePath);
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
    if (!request) {
      throw new Error('Rename request is required');
    }
    const sourcePath = normalizeFileName(request.sourcePath);
    const targetPath = normalizeFileName(request.targetPath);
    if (sourcePath === targetPath) {
      throw new Error(`Source and target file paths are equal: ${sourcePath}`);
    }
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const source = requireFile(root, sourcePath);
      moveNode(root, source, targetPath, 'f');
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
      requireChanged(changed.rowCount, `Repository file was not renamed: ${sourcePath}`);
      await this.saveTree(client, ownerId, repository.id, root);
      const renamed = await this.findFileById(client, ownerId, repository.id, source.id);
      if (!renamed) {
        throw new Error(`Repository file was not renamed: ${sourcePath}`);
      }
      return { path: targetPath, revision: revision(renamed) };
    });
  }

  async delete(ownerId: string, projectId: string, path: string): Promise<void> {
    const filePath = normalizeFileName(path);
    await this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const node = requireFile(root, filePath);
      removeNode(root, node);
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
    if (!request) {
      throw new Error('Create folder request is required');
    }
    const folderPath = normalizeDirectoryPath(request.path);
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      addDirectoryNode(root, folderPath);
      await this.saveTree(client, ownerId, repository.id, root);
      return { path: folderPath, revision: `tree:${folderPath}` };
    });
  }

  async renameFolder(ownerId: string, projectId: string, request: FileRenameRequest | null): Promise<FileOperationResponse> {
    if (!request) {
      throw new Error('Rename folder request is required');
    }
    const sourcePath = normalizeDirectoryPath(request.sourcePath);
    const targetPath = normalizeDirectoryPath(request.targetPath);
    if (sourcePath === targetPath) {
      throw new Error(`Source and target folder paths are equal: ${sourcePath}`);
    }
    if (targetPath.startsWith(`${sourcePath}/`)) {
      throw new Error(`Folder cannot be moved inside itself: ${sourcePath}`);
    }
    return this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const source = requireDirectory(root, sourcePath);
      moveNode(root, source, targetPath, 'd');
      await this.saveTree(client, ownerId, repository.id, root);
      return { path: targetPath, revision: `tree:${targetPath}` };
    });
  }

  async deleteFolder(ownerId: string, projectId: string, path: string): Promise<void> {
    const folderPath = normalizeDirectoryPath(path);
    await this.database.transaction(async (client) => {
      const repository = await this.requireRepository(client, ownerId, projectId, true);
      const root = await this.loadTree(client, ownerId, repository);
      const folder = requireDirectory(root, folderPath);
      const ids = fileIds(folder);
      removeNode(root, folder);
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
    for (const entry of fileNodes(root)) {
      if (!entry.path.endsWith('.ai')) {
        continue;
      }
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
      throw new Error(`Repository not found: ${projectId}`);
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

function projectName(repository: Pick<RepositoryRow, 'id' | 'name'>): string {
  return repository.name?.trim() || repository.id;
}

function nullableText(value: string | null | undefined, maxLength: number, fieldName: string): string | null {
  if (!value || value.trim() === '') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} is longer than ${maxLength} characters`);
  }
  return trimmed;
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
