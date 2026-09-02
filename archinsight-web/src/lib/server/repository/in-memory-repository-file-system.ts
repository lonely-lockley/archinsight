import { baseName, normalizeFileName, parentDirectory } from './path';
import {
  addFileChild,
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
  projectSummary,
  projectNameInput,
  renameFileNode,
  renameFolderNode,
  saveFileNode,
  sortProjectSummaries,
  sourceFileNodes
} from './repository-domain';
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
  RepositoryNode,
  RepositoryProjectSeed
} from './types';
import { conflict, notFound } from '$lib/server/errors/application-error';

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
    return sortProjectSummaries(this.ownerProjects(ownerId).map(toProjectSummary));
  }

  async createProject(ownerId: string, request: ProjectCreateRequest | null): Promise<ProjectSummaryResponse> {
    const name = projectNameInput(request?.name);
    const projects = this.ownerProjects(ownerId);
    if (projects.some((project) => project.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw conflict(`Project already exists: ${name}`);
    }
    const now = new Date().toISOString();
    const project: RepositoryProject = {
      id: crypto.randomUUID(), ownerId, name, root: rootNode(), files: new Map(), created: now, updated: now
    };
    this.projectsByOwner.set(ownerId, [...projects, project]);
    return toProjectSummary(project);
  }

  async updateProject(ownerId: string, projectId: string, request: ProjectUpdateRequest | null): Promise<ProjectSummaryResponse> {
    const name = projectNameInput(request?.name);
    const project = this.requireProject(ownerId, projectId);
    if (this.ownerProjects(ownerId).some((item) => item.id !== project.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw conflict(`Project already exists: ${name}`);
    }
    project.name = name;
    project.updated = new Date().toISOString();
    return toProjectSummary(project);
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
      throw notFound(`Repository file content not found: ${filePath}`);
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
    const input = normalizedFileSave(request);
    const { node } = saveFileNode(project.root, filePath);
    const previous = project.files.get(node.id);
    const nextRevision = (previous?.revision ?? 0) + 1;
    project.files.set(node.id, {
      id: node.id,
      content: input.content,
      revision: nextRevision
    });
    this.touch(project);
    return {
      path: filePath,
      revision: revision(node.id, nextRevision)
    };
  }

  async rename(ownerId: string, projectId: string, request: FileRenameRequest | null): Promise<FileOperationResponse> {
    const project = this.requireProject(ownerId, projectId);
    const { path: targetPath, node: source } = renameFileNode(project.root, request);
    const file = project.files.get(source.id);
    if (!file) throw notFound(`Repository file content not found: ${targetPath}`);
    file.revision += 1;
    this.touch(project);
    return {
      path: targetPath,
      revision: revision(source.id, file.revision)
    };
  }

  async delete(ownerId: string, projectId: string, path: string): Promise<void> {
    const project = this.requireProject(ownerId, projectId);
    const { path: filePath, node } = deleteFileNode(project.root, path);
    if (!project.files.delete(node.id)) {
      throw notFound(`Repository file content not found: ${filePath}`);
    }
    this.touch(project);
  }

  async createFolder(
    ownerId: string,
    projectId: string,
    request: FolderCreateRequest | null
  ): Promise<FileOperationResponse> {
    const project = this.requireProject(ownerId, projectId);
    const { path: folderPath } = createFolderNode(project.root, request);
    this.touch(project);
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
    const project = this.requireProject(ownerId, projectId);
    const { path: targetPath } = renameFolderNode(project.root, request);
    this.touch(project);
    return {
      path: targetPath,
      revision: `tree:${targetPath}`
    };
  }

  async deleteFolder(ownerId: string, projectId: string, path: string): Promise<void> {
    const project = this.requireProject(ownerId, projectId);
    const { fileIds: nestedFileIds } = deleteFolderNode(project.root, path);
    for (const fileId of nestedFileIds) {
      project.files.delete(fileId);
    }
    this.touch(project);
  }

  async sources(ownerId: string, projectId: string): Promise<Map<string, string>> {
    const project = this.requireProject(ownerId, projectId);
    const result = new Map<string, string>();
    for (const entry of sourceFileNodes(project.root)) {
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
      throw notFound(`Repository not found: ${projectId}`);
    }
    return project;
  }

  private touch(project: RepositoryProject): void {
    project.updated = new Date().toISOString();
  }

}

function toProjectSummary(project: RepositoryProject): ProjectSummaryResponse {
  return projectSummary({
    id: project.id,
    name: project.name,
    created: project.created,
    updated: project.updated,
    fileCount: project.files.size
  });
}

function revision(fileId: string, value: number): string {
  return `mem:${fileId}:${value}`;
}
