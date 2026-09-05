import type { TreeNode } from '@archinsight/workbench/types';
import type { DeleteDialogState, FileDialogState } from './repository-dialog-types';
import {
  findRepositoryNodeByDisplayPath,
  repositoryFilePathsInDirectory
} from './repository-tree';
import {
  joinPath,
  normalizeDialogName,
  validateNodeName,
  validateTargetPath
} from './repository-paths';

export type RepositoryControllerPorts = {
  createFolder(projectId: string, path: string): Promise<{ readonly path: string }>;
  deleteFile(projectId: string, path: string): Promise<void>;
  deleteFolder(projectId: string, path: string): Promise<void>;
  renameFile(projectId: string, sourcePath: string, targetPath: string): Promise<{ readonly path: string }>;
  renameFolder(projectId: string, sourcePath: string, targetPath: string): Promise<{ readonly path: string }>;
  saveFile(projectId: string, path: string, request: { readonly content: string }): Promise<{ readonly path: string }>;
};

export type RepositoryFileEffect =
  | {
      readonly kind: 'file-saved';
      readonly path: string;
      readonly content: string;
      readonly tabId?: string;
    }
  | {
      readonly kind: 'folder-created';
      readonly path: string;
    }
  | {
      readonly kind: 'file-renamed';
      readonly sourcePath: string;
      readonly path: string;
    }
  | {
      readonly kind: 'folder-renamed';
      readonly sourcePath: string;
      readonly path: string;
    };

export type RepositoryFileCommandResult =
  | {
      readonly ok: true;
      readonly effect: RepositoryFileEffect;
      readonly normalizedFileName: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'validation';
      readonly dialog: FileDialogState;
    }
  | {
      readonly ok: false;
      readonly reason: 'operation';
      readonly dialog: FileDialogState;
      readonly cause: unknown;
    };

export type RepositoryDeleteCommandResult = {
  readonly deletedFiles: readonly string[];
};

export type RepositoryController = {
  submitFileDialog(input: {
    readonly projectId: string;
    readonly tree: TreeNode | undefined;
    readonly dialog: FileDialogState;
  }): Promise<RepositoryFileCommandResult>;
  deleteItem(input: {
    readonly projectId: string;
    readonly tree: TreeNode | undefined;
    readonly openFilePaths: readonly string[];
    readonly dialog: DeleteDialogState;
  }): Promise<RepositoryDeleteCommandResult>;
};

export function createRepositoryController(ports: RepositoryControllerPorts): RepositoryController {
  return {
    async submitFileDialog({ projectId, tree, dialog }) {
      const targetFileName = normalizeDialogName(dialog.fileName, dialog.target);
      const nameValidation = validateNodeName(targetFileName, dialog.target);
      if (nameValidation !== undefined) {
        return {
          ok: false,
          reason: 'validation',
          dialog: { ...dialog, fileName: targetFileName, error: nameValidation }
        };
      }

      const targetPath = joinPath(dialog.directory, targetFileName);
      const pathValidation = validateTargetPath(
        targetPath,
        dialog.target,
        dialog.mode === 'rename' ? dialog.sourcePath : undefined,
        (candidate) => findRepositoryNodeByDisplayPath(tree, candidate) !== undefined
      );
      if (pathValidation !== undefined) {
        return {
          ok: false,
          reason: 'validation',
          dialog: { ...dialog, fileName: targetFileName, error: pathValidation }
        };
      }

      try {
        let effect: RepositoryFileEffect;
        if (dialog.mode === 'rename') {
          if (dialog.sourcePath === undefined) {
            return {
              ok: false,
              reason: 'validation',
              dialog: { ...dialog, error: `Source ${dialog.target} is missing` }
            };
          }
          if (dialog.target === 'folder') {
            const result = await ports.renameFolder(projectId, dialog.sourcePath, targetPath);
            effect = {
              kind: 'folder-renamed',
              sourcePath: dialog.sourcePath,
              path: result.path
            };
          } else {
            const result = await ports.renameFile(projectId, dialog.sourcePath, targetPath);
            effect = {
              kind: 'file-renamed',
              sourcePath: dialog.sourcePath,
              path: result.path
            };
          }
        } else if (dialog.target === 'folder') {
          const result = await ports.createFolder(projectId, targetPath);
          effect = { kind: 'folder-created', path: result.path };
        } else {
          const content = dialog.content ?? '';
          const result = await ports.saveFile(projectId, targetPath, { content });
          effect = {
            kind: 'file-saved',
            path: result.path,
            content,
            ...(dialog.tabId === undefined ? {} : { tabId: dialog.tabId })
          };
        }
        return { ok: true, effect, normalizedFileName: targetFileName };
      } catch (cause) {
        return {
          ok: false,
          reason: 'operation',
          dialog: { ...dialog, fileName: targetFileName },
          cause
        };
      }
    },

    async deleteItem({ projectId, tree, openFilePaths, dialog }) {
      const deletedFiles = dialog.target === 'folder'
        ? repositoryFilePathsInDirectory(tree, dialog.path, openFilePaths)
        : [dialog.path];
      if (dialog.target === 'folder') {
        await ports.deleteFolder(projectId, dialog.path);
      } else {
        await ports.deleteFile(projectId, dialog.path);
      }
      return { deletedFiles };
    }
  };
}
