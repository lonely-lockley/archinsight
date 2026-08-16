import { baseName, normalizeDirectoryPath, normalizeFileName, parentDirectory } from './path';
import {
  addDirectoryNode,
  addFileChild,
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
import type {
  FileContentResponse,
  FileOperationResponse,
  FileRenameRequest,
  FileSaveRequest,
  FileTreeNode,
  FileTreeResponse,
  FolderCreateRequest,
  ProjectCreateRequest,
  ProjectUpdateRequest,
  ProjectSummaryResponse,
  RepositoryFileSystem,
  RepositoryNode,
  RepositoryProjectSeed
} from './types';

type RepositoryFileRecord = {
  id: string;
  content: string;
  revision: number;
};

type RepositoryProject = {
  id: string;
  ownerId: string;
  name: string;
  root: RepositoryNode;
  files: Map<string, RepositoryFileRecord>;
  created: string;
  updated: string;
};

export class InMemoryRepositoryFileSystem implements RepositoryFileSystem {
  private readonly projectsByOwner = new Map<string, RepositoryProject[]>();

  constructor(seed: RepositoryProjectSeed[] = []) {
    if (seed.length > 0) {
      this.setProjects('default', seed);
    }
  }

  setProjects(ownerId: string, seed: RepositoryProjectSeed[]): void {
    this.projectsByOwner.set(
      ownerId,
      seed.map((project) => this.projectFromSeed(ownerId, project))
    );
  }

  async projects(ownerId: string): Promise<ProjectSummaryResponse[]> {
    return this.ownerProjects(ownerId).map(projectSummary);
  }

  async createProject(ownerId: string, request: ProjectCreateRequest | null): Promise<ProjectSummaryResponse> {
    const name = request?.name?.trim() ?? '';
    if (name.length === 0) {
      throw new Error('Project name is required');
    }
    if (name.length > 100) {
      throw new Error('Project name is longer than 100 characters');
    }
    const projects = this.ownerProjects(ownerId);
    if (projects.some((project) => project.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error(`Project already exists: ${name}`);
    }
    const now = new Date().toISOString();
    const project: RepositoryProject = {
      id: crypto.randomUUID(), ownerId, name, root: rootNode(), files: new Map(), created: now, updated: now
    };
    this.projectsByOwner.set(ownerId, [...projects, project]);
    return projectSummary(project);
  }

  async updateProject(ownerId: string, projectId: string, request: ProjectUpdateRequest | null): Promise<ProjectSummaryResponse> {
    const project = this.requireProject(ownerId, projectId);
    const name = request?.name?.trim() ?? '';
    if (name.length === 0) throw new Error('Project name is required');
    if (name.length > 100) throw new Error('Project name is longer than 100 characters');
    if (this.ownerProjects(ownerId).some((item) => item.id !== project.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error(`Project already exists: ${name}`);
    }
    project.name = name;
    project.updated = new Date().toISOString();
    return projectSummary(project);
  }

  async deleteProject(ownerId: string, projectId: string): Promise<void> {
    const project = this.requireProject(ownerId, projectId);
    this.projectsByOwner.set(ownerId, this.ownerProjects(ownerId).filter((item) => item.id !== project.id));
  }

  async tree(ownerId: string, projectId: string): Promise<FileTreeResponse> {
    const project = this.requireProject(ownerId, projectId);
    return {
      root: toFileTreeDto(project.root, '', project.name)
    };
  }

  async read(ownerId: string, projectId: string, path: string): Promise<FileContentResponse> {
    const filePath = normalizeFileName(path);
    const project = this.requireProject(ownerId, projectId);
    const node = requireFile(project.root, filePath);
    const file = project.files.get(node.id);
    if (!file) {
      throw new Error(`Repository file content not found: ${filePath}`);
    }
    return {
      path: filePath,
      content: file.content,
      readOnly: false,
      revision: revision(node.id, file.revision)
    };
  }

  async save(
    ownerId: string,
    projectId: string,
    path: string,
    request: FileSaveRequest | null
  ): Promise<FileOperationResponse> {
    const filePath = normalizeFileName(path);
    const project = this.requireProject(ownerId, projectId);
    const existing = findNode(project.root, filePath);
    if (existing?.type === 'd') {
      throw new Error(`Repository folder already exists: ${filePath}`);
    }
    const node = existing ?? addFileNode(project.root, filePath);
    const previous = project.files.get(node.id);
    const nextRevision = (previous?.revision ?? 0) + 1;
    project.files.set(node.id, {
      id: node.id,
      content: request?.content ?? '',
      revision: nextRevision
    });
    return {
      path: filePath,
      revision: revision(node.id, nextRevision)
    };
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
    const project = this.requireProject(ownerId, projectId);
    const source = requireFile(project.root, sourcePath);
    moveNode(project.root, source, targetPath, 'f');
    return {
      path: targetPath,
      revision: revision(source.id, project.files.get(source.id)?.revision ?? 0)
    };
  }

  async delete(ownerId: string, projectId: string, path: string): Promise<void> {
    const filePath = normalizeFileName(path);
    const project = this.requireProject(ownerId, projectId);
    const node = requireFile(project.root, filePath);
    removeNode(project.root, node);
    if (!project.files.delete(node.id)) {
      throw new Error(`Repository file content not found: ${filePath}`);
    }
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
    const project = this.requireProject(ownerId, projectId);
    addDirectoryNode(project.root, folderPath);
    return {
      path: folderPath,
      revision: `tree:${folderPath}`
    };
  }

  async renameFolder(
    ownerId: string,
    projectId: string,
    request: FileRenameRequest | null
  ): Promise<FileOperationResponse> {
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
    const project = this.requireProject(ownerId, projectId);
    const source = requireDirectory(project.root, sourcePath);
    moveNode(project.root, source, targetPath, 'd');
    return {
      path: targetPath,
      revision: `tree:${targetPath}`
    };
  }

  async deleteFolder(ownerId: string, projectId: string, path: string): Promise<void> {
    const folderPath = normalizeDirectoryPath(path);
    const project = this.requireProject(ownerId, projectId);
    const folder = requireDirectory(project.root, folderPath);
    for (const fileId of fileIds(folder)) {
      project.files.delete(fileId);
    }
    removeNode(project.root, folder);
  }

  async sources(ownerId: string, projectId: string): Promise<Map<string, string>> {
    const project = this.requireProject(ownerId, projectId);
    const result = new Map<string, string>();
    for (const entry of fileNodes(project.root)) {
      if (!entry.path.endsWith('.ai')) {
        continue;
      }
      const file = project.files.get(entry.node.id);
      if (file) {
        result.set(entry.path, file.content);
      }
    }
    return result;
  }

  private projectFromSeed(ownerId: string, seed: RepositoryProjectSeed): RepositoryProject {
    const root = normalizeTree(seed.structure ?? rootNode());
    const files = new Map<string, RepositoryFileRecord>();
    const project: RepositoryProject = {
      id: seed.id,
      ownerId,
      name: seed.name,
      root,
      files,
      created: new Date().toISOString(),
      updated: new Date().toISOString()
    };
    for (const [path, content] of Object.entries(seed.files ?? {})) {
      const filePath = normalizeFileName(path);
      const parent = ensureDirectory(project.root, parentDirectory(filePath));
      const node = findNode(project.root, filePath) ?? addFileChild(parent, baseName(filePath));
      files.set(node.id, {
        id: node.id,
        content,
        revision: 1
      });
    }
    return project;
  }

  private ownerProjects(ownerId: string): RepositoryProject[] {
    return this.projectsByOwner.get(ownerId) ?? [];
  }

  private requireProject(ownerId: string, projectId: string): RepositoryProject {
    const project = this.ownerProjects(ownerId).find((candidate) => candidate.id === projectId || candidate.name === projectId);
    if (!project) {
      throw new Error(`Repository not found: ${projectId}`);
    }
    return project;
  }

}

function projectSummary(project: RepositoryProject): ProjectSummaryResponse {
  return {
    id: project.id,
    name: project.name,
    created: project.created,
    updated: project.updated,
    fileCount: project.files.size
  };
}

function revision(fileId: string, value: number): string {
  return `mem:${fileId}:${value}`;
}
