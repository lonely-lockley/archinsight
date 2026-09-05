import { describe, expect, it } from 'vitest';
import type { TreeNode } from '@archinsight/workbench/types';
import {
  findRepositoryNode,
  findRepositoryNodeByDisplayPath,
  repositoryDirectories,
  repositoryFilePathsInDirectory
} from './repository-tree';

const tree: TreeNode = {
  name: 'Project',
  path: '',
  type: 'directory',
  children: [
    {
      name: 'src',
      path: 'src',
      type: 'directory',
      children: [
        { name: 'main.ai', path: 'src/main.ai', type: 'file', children: [] },
        {
          name: 'domain',
          path: 'src/domain',
          type: 'directory',
          children: [
            { name: 'model.ai', path: 'src/domain/model.ai', type: 'file', children: [] }
          ]
        }
      ]
    },
    { name: 'src-copy.ai', path: 'src-copy.ai', type: 'file', children: [] }
  ]
};

describe('repository tree model', () => {
  it('finds nodes by repository path and optional type', () => {
    expect(findRepositoryNode(tree, 'src/domain')?.name).toBe('domain');
    expect(findRepositoryNode(tree, 'src/main.ai', 'file')?.name).toBe('main.ai');
    expect(findRepositoryNode(tree, 'src/main.ai', 'directory')).toBeUndefined();
  });

  it('returns no node when the tree or path is missing', () => {
    expect(findRepositoryNode(undefined, 'src')).toBeUndefined();
    expect(findRepositoryNode(tree, 'missing')).toBeUndefined();
  });

  it('finds files by their extension-free display path', () => {
    expect(findRepositoryNodeByDisplayPath(tree, 'src/main')?.path).toBe('src/main.ai');
    expect(findRepositoryNodeByDisplayPath(tree, 'src/domain')?.type).toBe('directory');
    expect(findRepositoryNodeByDisplayPath(undefined, 'src/main')).toBeUndefined();
  });

  it('lists repository directories in stable tree order', () => {
    expect(repositoryDirectories(tree).map((node) => node.path)).toEqual(['', 'src', 'src/domain']);
    expect(repositoryDirectories(undefined)).toEqual([]);
  });

  it('collects nested tree files and deduplicates open files', () => {
    expect(repositoryFilePathsInDirectory(tree, 'src', [
      'src/main.ai',
      'src/local.ai',
      'src2/not-a-child.ai'
    ])).toEqual(['src/main.ai', 'src/domain/model.ai', 'src/local.ai']);
  });

  it('still returns matching open files when metadata has no directory', () => {
    expect(repositoryFilePathsInDirectory(undefined, 'drafts', [
      'drafts/one.ai',
      'drafts/nested/two.ai',
      'drafts-copy/three.ai'
    ])).toEqual(['drafts/one.ai', 'drafts/nested/two.ai']);
  });
});
