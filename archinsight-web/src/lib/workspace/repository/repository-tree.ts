import type { TreeNode } from '$lib/workspace-types';
import { displayNodePath, isInsideDirectory } from './repository-paths';

export function findRepositoryNode(
  tree: TreeNode | undefined,
  path: string,
  type?: TreeNode['type']
): TreeNode | undefined {
  if (tree === undefined) {
    return undefined;
  }
  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (node.path === path && (type === undefined || node.type === type)) {
      return node;
    }
    stack.push(...node.children);
  }
  return undefined;
}

export function findRepositoryNodeByDisplayPath(
  tree: TreeNode | undefined,
  path: string
): TreeNode | undefined {
  if (tree === undefined) {
    return undefined;
  }
  const stack = [tree];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    const target = node.type === 'directory' ? 'folder' : 'file';
    if (displayNodePath(node.path, target) === path) {
      return node;
    }
    stack.push(...node.children);
  }
  return undefined;
}

export function repositoryDirectories(tree: TreeNode | undefined): TreeNode[] {
  if (tree === undefined) {
    return [];
  }
  const result: TreeNode[] = [];
  const visit = (node: TreeNode): void => {
    if (node.type !== 'directory') {
      return;
    }
    result.push(node);
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(tree);
  return result;
}

export function repositoryFilePathsInDirectory(
  tree: TreeNode | undefined,
  directory: string,
  openFilePaths: Iterable<string> = []
): string[] {
  const result = new Set<string>();
  const directoryNode = findRepositoryNode(tree, directory, 'directory');
  if (directoryNode !== undefined) {
    const visit = (node: TreeNode): void => {
      if (node.type === 'file') {
        result.add(node.path);
        return;
      }
      for (const child of node.children) {
        visit(child);
      }
    };
    visit(directoryNode);
  }
  for (const path of openFilePaths) {
    if (isInsideDirectory(path, directory)) {
      result.add(path);
    }
  }
  return [...result];
}
