import type { ActionId } from '$lib/actions/action-model';
import type { TreeNode } from '@archinsight/workbench/types';
import { errorMessage } from '../messages/message-controller';
import type {
  RepositoryController,
  RepositoryFileEffect
} from './repository-controller';
import type { DeleteDialogState, FileDialogState } from './repository-dialog-types';
import { baseName, displayFileName, parentDirectory } from './repository-paths';

const defaultNewFileName = 'untitled';

export type RepositoryDialogControllerPorts = {
  fileDialog(): FileDialogState | undefined;
  setFileDialog(dialog: FileDialogState | undefined): void;
  deleteDialog(): DeleteDialogState | undefined;
  setDeleteDialog(dialog: DeleteDialogState | undefined): void;
  closeMenu(): void;
  authorize(actionId: ActionId): boolean;
  projectId(): string;
  tree(): TreeNode | undefined;
  openFilePaths(): readonly string[];
  commands: RepositoryController;
  acceptDeletedFiles(paths: readonly string[]): Promise<void>;
  acceptFileEffect(effect: RepositoryFileEffect): Promise<void>;
  refreshProjectMetadata(): Promise<void>;
  persistWorkspace(): void;
  scheduleLink(): void;
  redirectIfAuthRequired(error: unknown): boolean;
};

export type RepositoryDialogController = {
  newFile(directory: string): void;
  newFolder(directory: string): void;
  renameFile(path: string): void;
  renameFolder(path: string): void;
  deleteFile(path: string): void;
  deleteFolder(path: string): void;
  openFileDialog(state: FileDialogState): void;
  updateDirectory(directory: string): void;
  updateFileName(fileName: string): void;
  closeFileDialog(): void;
  closeDeleteDialog(): void;
  confirmFileDialog(): Promise<void>;
  confirmDeleteDialog(): Promise<void>;
};

export function createRepositoryDialogController(
  ports: RepositoryDialogControllerPorts
): RepositoryDialogController {
  const openFileDialog = (state: FileDialogState): void => {
    ports.setFileDialog({
      ...state,
      fileName: state.fileName || defaultNewFileName,
      directory: state.directory ?? ''
    });
  };

  const actionForDialog = (dialog: FileDialogState): ActionId => dialog.mode === 'rename'
    ? dialog.target === 'folder' ? 'repository.folder.rename' : 'repository.file.rename'
    : dialog.target === 'folder'
      ? 'repository.folder.create'
      : dialog.mode === 'save' ? 'repository.file.save' : 'repository.file.create';

  const closeMenuAndAuthorize = (actionId: ActionId): boolean => {
    ports.closeMenu();
    return ports.authorize(actionId);
  };

  return {
    newFile(directory) {
      if (!closeMenuAndAuthorize('repository.file.create')) return;
      openFileDialog({
        mode: 'new', target: 'file', title: 'New file', directory,
        fileName: defaultNewFileName, content: ''
      });
    },

    newFolder(directory) {
      if (!closeMenuAndAuthorize('repository.folder.create')) return;
      openFileDialog({
        mode: 'new', target: 'folder', title: 'New folder', directory, fileName: 'folder'
      });
    },

    renameFile(path) {
      if (!closeMenuAndAuthorize('repository.file.rename')) return;
      openFileDialog({
        mode: 'rename', target: 'file', title: 'Rename or move',
        directory: parentDirectory(path), fileName: displayFileName(path), sourcePath: path
      });
    },

    renameFolder(path) {
      if (!closeMenuAndAuthorize('repository.folder.rename')) return;
      openFileDialog({
        mode: 'rename', target: 'folder', title: 'Rename or move folder',
        directory: parentDirectory(path), fileName: baseName(path), sourcePath: path
      });
    },

    deleteFile(path) {
      if (!closeMenuAndAuthorize('repository.file.delete')) return;
      ports.setDeleteDialog({ path, target: 'file' });
    },

    deleteFolder(path) {
      if (!closeMenuAndAuthorize('repository.folder.delete')) return;
      ports.setDeleteDialog({ path, target: 'folder' });
    },

    openFileDialog,

    updateDirectory(directory) {
      const dialog = ports.fileDialog();
      if (dialog !== undefined) {
        ports.setFileDialog({ ...dialog, directory, error: undefined });
      }
    },

    updateFileName(fileName) {
      const dialog = ports.fileDialog();
      if (dialog !== undefined) {
        ports.setFileDialog({ ...dialog, fileName, error: undefined });
      }
    },

    closeFileDialog() {
      ports.setFileDialog(undefined);
    },

    closeDeleteDialog() {
      ports.setDeleteDialog(undefined);
    },

    async confirmDeleteDialog() {
      const dialog = ports.deleteDialog();
      if (dialog === undefined) return;
      const actionId = dialog.target === 'folder'
        ? 'repository.folder.delete'
        : 'repository.file.delete';
      if (!ports.authorize(actionId)) {
        ports.setDeleteDialog(undefined);
        return;
      }
      try {
        const result = await ports.commands.deleteItem({
          projectId: ports.projectId(),
          tree: ports.tree(),
          openFilePaths: ports.openFilePaths(),
          dialog
        });
        await ports.acceptDeletedFiles(result.deletedFiles);
        await ports.refreshProjectMetadata();
        ports.persistWorkspace();
        ports.scheduleLink();
        ports.setDeleteDialog(undefined);
      } catch (error) {
        if (!ports.redirectIfAuthRequired(error)) {
          ports.setDeleteDialog({ ...dialog, error: errorMessage(error) });
        }
      }
    },

    async confirmFileDialog() {
      const dialog = ports.fileDialog();
      if (dialog === undefined) return;
      if (!ports.authorize(actionForDialog(dialog))) {
        ports.setFileDialog(undefined);
        return;
      }
      let normalizedFileName = dialog.fileName;
      try {
        const result = await ports.commands.submitFileDialog({
          projectId: ports.projectId(),
          tree: ports.tree(),
          dialog
        });
        if (!result.ok) {
          if (result.reason === 'operation') {
            if (!ports.redirectIfAuthRequired(result.cause)) {
              ports.setFileDialog({ ...result.dialog, error: errorMessage(result.cause) });
            }
          } else {
            ports.setFileDialog(result.dialog);
          }
          return;
        }
        normalizedFileName = result.normalizedFileName;
        await ports.acceptFileEffect(result.effect);
        await ports.refreshProjectMetadata();
        ports.persistWorkspace();
        ports.scheduleLink();
        ports.setFileDialog(undefined);
      } catch (error) {
        if (!ports.redirectIfAuthRequired(error)) {
          ports.setFileDialog({
            ...dialog,
            fileName: normalizedFileName,
            error: errorMessage(error)
          });
        }
      }
    }
  };
}
