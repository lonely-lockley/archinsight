import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '@archinsight/workbench/types';
import {
  createRepositoryController,
  type RepositoryControllerPorts
} from './repository-controller';

const initialTree: TreeNode = {
  name: '',
  path: '',
  type: 'directory',
  children: [
    {
      name: 'domain',
      path: 'domain',
      type: 'directory',
      children: [
        { name: 'main.ai', path: 'domain/main.ai', type: 'file', children: [] },
        { name: 'nested.ai', path: 'domain/nested.ai', type: 'file', children: [] }
      ]
    },
    { name: 'existing.ai', path: 'existing.ai', type: 'file', children: [] }
  ]
};

const ports = (): RepositoryControllerPorts => ({
  createFolder: vi.fn(async (_projectId, path) => ({ path })),
  deleteFile: vi.fn(async () => undefined),
  deleteFolder: vi.fn(async () => undefined),
  renameFile: vi.fn(async (_projectId, _sourcePath, targetPath) => ({ path: targetPath })),
  renameFolder: vi.fn(async (_projectId, _sourcePath, targetPath) => ({ path: targetPath })),
  saveFile: vi.fn(async (_projectId, path) => ({ path }))
});

describe('repository controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a file and normalizes its extension', async () => {
    const adapter = ports();
    const controller = createRepositoryController(adapter);

    const result = await controller.submitFileDialog({
      projectId: 'project-1',
      tree: initialTree,
      dialog: {
        mode: 'new',
        target: 'file',
        title: 'New file',
        directory: 'domain',
        fileName: 'service.ai',
        content: 'system service'
      }
    });

    expect(adapter.saveFile).toHaveBeenCalledWith(
      'project-1',
      'domain/service',
      { content: 'system service' }
    );
    expect(result).toEqual({
      ok: true,
      normalizedFileName: 'service',
      effect: {
        kind: 'file-saved',
        path: 'domain/service',
        content: 'system service'
      }
    });
  });

  it('preserves the source tab identity when Save As creates a file', async () => {
    const adapter = ports();
    const controller = createRepositoryController(adapter);

    const result = await controller.submitFileDialog({
      projectId: 'project-1',
      tree: initialTree,
      dialog: {
        mode: 'save',
        target: 'file',
        title: 'Save file',
        directory: '',
        fileName: 'copy',
        content: 'copied',
        tabId: 'untitled-1'
      }
    });

    expect(result).toMatchObject({
      ok: true,
      effect: {
        kind: 'file-saved',
        path: 'copy',
        content: 'copied',
        tabId: 'untitled-1'
      }
    });
  });

  it.each([
    {
      label: 'folder creation',
      dialog: {
        mode: 'new' as const,
        target: 'folder' as const,
        title: 'New folder',
        directory: '',
        fileName: 'services'
      },
      port: 'createFolder' as const,
      args: ['project-1', 'services'],
      effect: { kind: 'folder-created', path: 'services' }
    },
    {
      label: 'file rename',
      dialog: {
        mode: 'rename' as const,
        target: 'file' as const,
        title: 'Rename file',
        directory: 'domain',
        fileName: 'renamed',
        sourcePath: 'domain/main.ai'
      },
      port: 'renameFile' as const,
      args: ['project-1', 'domain/main.ai', 'domain/renamed'],
      effect: {
        kind: 'file-renamed',
        sourcePath: 'domain/main.ai',
        path: 'domain/renamed'
      }
    },
    {
      label: 'folder rename',
      dialog: {
        mode: 'rename' as const,
        target: 'folder' as const,
        title: 'Rename folder',
        directory: '',
        fileName: 'architecture',
        sourcePath: 'domain'
      },
      port: 'renameFolder' as const,
      args: ['project-1', 'domain', 'architecture'],
      effect: {
        kind: 'folder-renamed',
        sourcePath: 'domain',
        path: 'architecture'
      }
    }
  ])('executes $label and returns its UI effect', async ({ dialog, port, args, effect }) => {
    const adapter = ports();
    const controller = createRepositoryController(adapter);

    const result = await controller.submitFileDialog({
      projectId: 'project-1',
      tree: initialTree,
      dialog
    });

    expect(adapter[port]).toHaveBeenCalledWith(...args);
    expect(result).toEqual({
      ok: true,
      normalizedFileName: dialog.fileName,
      effect
    });
  });

  it.each([
    {
      label: 'empty name',
      fileName: '   ',
      directory: '',
      error: 'File name is required'
    },
    {
      label: 'nested name',
      fileName: 'nested/name',
      directory: '',
      error: 'File name must not contain directories'
    },
    {
      label: 'existing target',
      fileName: 'existing',
      directory: '',
      error: 'Repository item already exists: existing'
    }
  ])('rejects $label without calling a mutation port', async ({ fileName, directory, error }) => {
    const adapter = ports();
    const controller = createRepositoryController(adapter);

    const result = await controller.submitFileDialog({
      projectId: 'project-1',
      tree: initialTree,
      dialog: {
        mode: 'new',
        target: 'file',
        title: 'New file',
        directory,
        fileName
      }
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'validation',
      dialog: { error }
    });
    expect(adapter.saveFile).not.toHaveBeenCalled();
  });

  it('rejects a rename without a source path', async () => {
    const adapter = ports();
    const controller = createRepositoryController(adapter);

    const result = await controller.submitFileDialog({
      projectId: 'project-1',
      tree: initialTree,
      dialog: {
        mode: 'rename',
        target: 'folder',
        title: 'Rename folder',
        directory: '',
        fileName: 'renamed'
      }
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'validation',
      dialog: { error: 'Source folder is missing' }
    });
    expect(adapter.renameFolder).not.toHaveBeenCalled();
  });

  it('returns adapter failures with the normalized dialog state', async () => {
    const adapter = ports();
    vi.mocked(adapter.saveFile).mockRejectedValueOnce(new Error('write failed'));
    const controller = createRepositoryController(adapter);

    const result = await controller.submitFileDialog({
      projectId: 'project-1',
      tree: initialTree,
      dialog: {
        mode: 'new',
        target: 'file',
        title: 'New file',
        directory: '',
        fileName: 'main.ai'
      }
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'operation',
      dialog: { fileName: 'main' },
      cause: expect.objectContaining({ message: 'write failed' })
    });
  });

  it('deletes a file and identifies its local state', async () => {
    const adapter = ports();
    const controller = createRepositoryController(adapter);

    const result = await controller.deleteItem({
      projectId: 'project-1',
      tree: initialTree,
      openFilePaths: [],
      dialog: { target: 'file', path: 'existing.ai' }
    });

    expect(adapter.deleteFile).toHaveBeenCalledWith('project-1', 'existing.ai');
    expect(adapter.deleteFolder).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedFiles: ['existing.ai'] });
  });

  it('includes tree files and open descendants when deleting a folder', async () => {
    const adapter = ports();
    const controller = createRepositoryController(adapter);

    const result = await controller.deleteItem({
      projectId: 'project-1',
      tree: initialTree,
      openFilePaths: ['domain/local.ai', 'outside.ai'],
      dialog: { target: 'folder', path: 'domain' }
    });

    expect(adapter.deleteFolder).toHaveBeenCalledWith('project-1', 'domain');
    expect(adapter.deleteFile).not.toHaveBeenCalled();
    expect(result).toEqual({
      deletedFiles: ['domain/main.ai', 'domain/nested.ai', 'domain/local.ai']
    });
  });

  it('propagates a delete failure without attempting another mutation', async () => {
    const adapter = ports();
    vi.mocked(adapter.deleteFolder).mockRejectedValueOnce(new Error('delete failed'));
    const controller = createRepositoryController(adapter);

    await expect(controller.deleteItem({
      projectId: 'project-1',
      tree: initialTree,
      openFilePaths: ['domain/local.ai'],
      dialog: { target: 'folder', path: 'domain' }
    })).rejects.toThrow('delete failed');

    expect(adapter.deleteFile).not.toHaveBeenCalled();
  });
});
