import {
  baseName,
  childPath,
  normalizeDirectoryPath,
  normalizeFileName,
  parentDirectory
} from './path';
import type { FileTreeNode, RepositoryNode } from './types';
import { conflict, invalidRequest, notFound } from '$lib/server/errors/application-error';

export function rootNode(): RepositoryNode {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    name: '/',
    type: 'd',
    childNodes: []
  };
}

export function directoryNode(parentId: string, name: string): RepositoryNode {
  return {
    id: crypto.randomUUID(),
    parentId,
    name,
    type: 'd',
    childNodes: []
  };
}

export function fileNode(parentId: string, name: string): RepositoryNode {
  return {
    id: crypto.randomUUID(),
    parentId,
    name,
    type: 'f',
    childNodes: []
  };
}

export function addFileChild(parent: RepositoryNode, name: string): RepositoryNode {
  rejectChildCollision(parent, name);
  const node = fileNode(parent.id, name);
  parent.childNodes.push(node);
  sortChildren(parent);
  return node;
}

export function normalizeTree(root: RepositoryNode | null | undefined): RepositoryNode {
  const normalized = root ?? rootNode();
  normalized.id ||= crypto.randomUUID();
  normalized.parentId = null;
  normalized.name ||= '/';
  normalized.type ||= 'd';
  normalized.childNodes ||= [];
  normalizeChildren(normalized);
  return normalized;
}

export function normalizeChildren(parent: RepositoryNode): void {
  parent.childNodes ||= [];
  for (const child of parent.childNodes) {
    child.id ||= crypto.randomUUID();
    child.parentId = parent.id;
    child.childNodes ||= [];
    normalizeChildren(child);
  }
  sortChildren(parent);
}

export function addFileNode(root: RepositoryNode, path: string): RepositoryNode {
  const parent = requireDirectory(root, parentDirectory(path));
  rejectChildCollision(parent, baseName(path));
  return addFileChild(parent, baseName(path));
}

export function addDirectoryNode(root: RepositoryNode, path: string): RepositoryNode {
  const parent = requireDirectory(root, parentDirectory(path));
  rejectChildCollision(parent, baseName(path));
  const node = directoryNode(parent.id, baseName(path));
  parent.childNodes.push(node);
  sortChildren(parent);
  return node;
}

export function ensureDirectory(root: RepositoryNode, path: string): RepositoryNode {
  let current = root;
  if (path === '') {
    return current;
  }
  for (const segment of path.split('/')) {
    const existing = current.childNodes.find((child) => child.name === segment);
    if (existing) {
      if (existing.type === 'f') {
        throw conflict(`Repository file already exists: ${path}`);
      }
      current = existing;
      continue;
    }
    const next = directoryNode(current.id, segment);
    current.childNodes.push(next);
    sortChildren(current);
    current = next;
  }
  return current;
}

export function moveNode(root: RepositoryNode, source: RepositoryNode, targetPath: string, expectedType: 'd' | 'f'): void {
  const targetParent = requireDirectory(root, parentDirectory(targetPath));
  rejectChildCollision(targetParent, baseName(targetPath));
  if (source.type !== expectedType) {
    throw invalidRequest(`Repository node type mismatch: ${targetPath}`);
  }
  removeNode(root, source);
  source.name = baseName(targetPath);
  source.parentId = targetParent.id;
  normalizeChildren(source);
  targetParent.childNodes.push(source);
  sortChildren(targetParent);
}

export function removeNode(root: RepositoryNode, node: RepositoryNode): void {
  const nodeParent = parent(root, node.parentId);
  if (!nodeParent) {
    throw notFound(`Repository parent folder not found: ${node.name}`);
  }
  nodeParent.childNodes = nodeParent.childNodes.filter((child) => child.id !== node.id);
}

export function requireFile(root: RepositoryNode, path: string): RepositoryNode {
  const node = findNode(root, normalizeFileName(path));
  if (!node) {
    throw notFound(`Repository file not found: ${normalizeFileName(path)}`);
  }
  if (node.type !== 'f') {
    throw invalidRequest(`Repository path is not a file: ${normalizeFileName(path)}`);
  }
  return node;
}

export function requireDirectory(root: RepositoryNode, path: string): RepositoryNode {
  const directoryPath = path === '' ? '' : normalizeDirectoryPath(path);
  if (directoryPath === '') {
    return root;
  }
  const node = findNode(root, directoryPath);
  if (!node) {
    throw notFound(`Repository folder not found: ${directoryPath}`);
  }
  if (node.type !== 'd') {
    throw invalidRequest(`Repository path is not a folder: ${directoryPath}`);
  }
  return node;
}

export function findNode(root: RepositoryNode, path: string): RepositoryNode | null {
  let current = root;
  if (path === '') {
    return current;
  }
  for (const segment of path.split('/')) {
    const next = current.childNodes.find((child) => child.name === segment);
    if (!next) {
      return null;
    }
    current = next;
  }
  return current;
}

export function parent(node: RepositoryNode, parentId: string | null): RepositoryNode | null {
  if (parentId && node.id === parentId) {
    return node;
  }
  for (const child of node.childNodes) {
    const found = parent(child, parentId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function fileIds(node: RepositoryNode): string[] {
  if (node.type === 'f') {
    return [node.id];
  }
  return node.childNodes.flatMap((child) => fileIds(child));
}

export function fileNodes(root: RepositoryNode): Array<{ path: string; node: RepositoryNode }> {
  const result: Array<{ path: string; node: RepositoryNode }> = [];
  collectFileNodes(root, '', result);
  return result;
}

export function toFileTreeDto(node: RepositoryNode, path: string, rootName: string): FileTreeNode {
  const directory = node.type === 'd';
  return {
    name: path === '' ? rootName : node.name,
    path,
    type: directory ? 'directory' : 'file',
    children: node.childNodes.map((child) => toFileTreeDto(child, childPath(path, child.name), rootName))
  };
}

export function sortChildren(node: RepositoryNode): void {
  node.childNodes.sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'd' ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'accent' });
  });
  for (const child of node.childNodes) {
    sortChildren(child);
  }
}

function rejectChildCollision(parent: RepositoryNode, name: string): void {
  if (parent.childNodes.some((child) => child.name === name)) {
    throw conflict(`Repository item already exists: ${name}`);
  }
}

function collectFileNodes(
  node: RepositoryNode,
  path: string,
  result: Array<{ path: string; node: RepositoryNode }>
): void {
  if (node.type === 'f') {
    result.push({ path, node });
    return;
  }
  for (const child of node.childNodes) {
    collectFileNodes(child, childPath(path, child.name), result);
  }
}
