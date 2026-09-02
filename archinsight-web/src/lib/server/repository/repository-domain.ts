import { normalizeDirectoryPath, normalizeFileName } from './path';
import {
  addDirectoryNode,
  addFileNode,
  fileIds,
  fileNodes,
  findNode,
  moveNode,
  removeNode,
  requireDirectory,
  requireFile
} from './repository-tree';
import type {
  FileRenameRequest,
  FileSaveRequest,
  FolderCreateRequest,
  ProjectSummaryResponse,
  RepositoryNode
} from './types';
import { conflict, invalidRequest } from '$lib/server/errors/application-error';

export type NormalizedFileSave = {
  content: string;
  level: string | null;
  projectIdentifier: string | null;
};

export type RepositoryNodeCommand = {
  path: string;
  node: RepositoryNode;
};

export function projectNameInput(value: string | null | undefined): string {
  const name = value?.trim() ?? '';
  if (name.length === 0) throw invalidRequest('Project name is required');
  if (name.length > 100) throw invalidRequest('Project name is longer than 100 characters');
  return name;
}

export function projectDisplayName(id: string, name: string | null | undefined): string {
  return name?.trim() || id;
}

export function projectSummary(input: {
  id: string;
  name: string | null | undefined;
  created: Date | string | null | undefined;
  updated: Date | string | null | undefined;
  fileCount: number | string | null | undefined;
}): ProjectSummaryResponse {
  return {
    id: input.id,
    name: projectDisplayName(input.id, input.name),
    created: timestamp(input.created),
    updated: timestamp(input.updated),
    fileCount: Number(input.fileCount ?? 0)
  };
}

export function sortProjectSummaries(projects: ProjectSummaryResponse[]): ProjectSummaryResponse[] {
  return projects.sort((left, right) => right.updated.localeCompare(left.updated) || left.name.localeCompare(right.name));
}

export function normalizedFileSave(request: FileSaveRequest | null): NormalizedFileSave {
  return {
    content: request?.content ?? '',
    level: nullableText(request?.level, 50, 'level'),
    projectIdentifier: nullableText(request?.projectIdentifier, 50, 'projectIdentifier')
  };
}

export function saveFileNode(root: RepositoryNode, path: string): RepositoryNodeCommand {
  const filePath = normalizeFileName(path);
  const existing = findNode(root, filePath);
  if (existing?.type === 'd') throw conflict(`Repository folder already exists: ${filePath}`);
  return { path: filePath, node: existing ?? addFileNode(root, filePath) };
}

export function renameFileNode(root: RepositoryNode, request: FileRenameRequest | null): RepositoryNodeCommand {
  if (!request) throw invalidRequest('Rename request is required');
  const sourcePath = normalizeFileName(request.sourcePath);
  const targetPath = normalizeFileName(request.targetPath);
  if (sourcePath === targetPath) throw invalidRequest(`Source and target file paths are equal: ${sourcePath}`);
  const source = requireFile(root, sourcePath);
  moveNode(root, source, targetPath, 'f');
  return { path: targetPath, node: source };
}

export function deleteFileNode(root: RepositoryNode, path: string): RepositoryNodeCommand {
  const filePath = normalizeFileName(path);
  const node = requireFile(root, filePath);
  removeNode(root, node);
  return { path: filePath, node };
}

export function createFolderNode(root: RepositoryNode, request: FolderCreateRequest | null): RepositoryNodeCommand {
  if (!request) throw invalidRequest('Create folder request is required');
  const folderPath = normalizeDirectoryPath(request.path);
  return { path: folderPath, node: addDirectoryNode(root, folderPath) };
}

export function renameFolderNode(root: RepositoryNode, request: FileRenameRequest | null): RepositoryNodeCommand {
  if (!request) throw invalidRequest('Rename folder request is required');
  const sourcePath = normalizeDirectoryPath(request.sourcePath);
  const targetPath = normalizeDirectoryPath(request.targetPath);
  if (sourcePath === targetPath) throw invalidRequest(`Source and target folder paths are equal: ${sourcePath}`);
  if (targetPath.startsWith(`${sourcePath}/`)) throw invalidRequest(`Folder cannot be moved inside itself: ${sourcePath}`);
  const source = requireDirectory(root, sourcePath);
  moveNode(root, source, targetPath, 'd');
  return { path: targetPath, node: source };
}

export function deleteFolderNode(root: RepositoryNode, path: string): RepositoryNodeCommand & { fileIds: string[] } {
  const folderPath = normalizeDirectoryPath(path);
  const node = requireDirectory(root, folderPath);
  const nestedFileIds = fileIds(node);
  removeNode(root, node);
  return { path: folderPath, node, fileIds: nestedFileIds };
}

export function sourceFileNodes(root: RepositoryNode): Array<{ path: string; node: RepositoryNode }> {
  return fileNodes(root).filter((entry) => entry.path.endsWith('.ai'));
}

function nullableText(value: string | null | undefined, maxLength: number, fieldName: string): string | null {
  if (!value || value.trim() === '') return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw invalidRequest(`${fieldName} is longer than ${maxLength} characters`);
  return trimmed;
}

function timestamp(value: Date | string | null | undefined): string {
  return value instanceof Date ? value.toISOString() : String(value ?? '');
}
