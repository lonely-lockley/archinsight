import { describe, expect, it, vi } from 'vitest';
import type { RepositoryController } from './repository-controller';
import { createRepositoryDialogController, type RepositoryDialogControllerPorts } from './repository-dialog-controller';
import type { DeleteDialogState, FileDialogState } from './repository-dialog-types';

function fixture() {
  let fileDialog: FileDialogState | undefined;
  let deleteDialog: DeleteDialogState | undefined;
  const commands: RepositoryController = {
    submitFileDialog: vi.fn(async () => ({
      ok: true as const,
      normalizedFileName: 'main.ai',
      effect: { kind: 'file-saved' as const, path: 'main.ai', content: '' }
    })),
    deleteItem: vi.fn(async () => ({ deletedFiles: ['main.ai'] }))
  };
  const ports: RepositoryDialogControllerPorts = {
    fileDialog: () => fileDialog,
    setFileDialog: (next) => { fileDialog = next; },
    deleteDialog: () => deleteDialog,
    setDeleteDialog: (next) => { deleteDialog = next; },
    closeMenu: vi.fn(),
    authorize: vi.fn(() => true),
    projectId: () => 'project',
    tree: () => undefined,
    openFilePaths: () => ['main.ai'],
    commands,
    acceptDeletedFiles: vi.fn(async () => undefined),
    acceptFileEffect: vi.fn(async () => undefined),
    refreshProjectMetadata: vi.fn(async () => undefined),
    persistWorkspace: vi.fn(),
    scheduleLink: vi.fn(),
    redirectIfAuthRequired: vi.fn(() => false)
  };
  return {
    ports,
    commands,
    controller: createRepositoryDialogController(ports),
    fileDialog: () => fileDialog,
    deleteDialog: () => deleteDialog
  };
}

describe('repository dialog controller', () => {
  it('checks authorization before opening a command dialog', () => {
    const subject = fixture();
    vi.mocked(subject.ports.authorize).mockReturnValueOnce(false);
    subject.controller.newFile('domain');

    expect(subject.ports.closeMenu).toHaveBeenCalledOnce();
    expect(subject.ports.authorize).toHaveBeenCalledWith('repository.file.create');
    expect(subject.fileDialog()).toBeUndefined();
  });

  it('derives rename defaults from the selected file path', () => {
    const subject = fixture();
    subject.controller.renameFile('domain/main.ai');
    expect(subject.fileDialog()).toMatchObject({
      mode: 'rename', target: 'file', directory: 'domain', fileName: 'main', sourcePath: 'domain/main.ai'
    });
  });

  it('opens folder create and rename dialogs with folder-specific defaults', () => {
    const subject = fixture();
    subject.controller.newFolder('domain');
    expect(subject.fileDialog()).toMatchObject({ target: 'folder', fileName: 'folder' });
    subject.controller.closeFileDialog();
    subject.controller.renameFolder('domain/old');
    expect(subject.fileDialog()).toMatchObject({
      mode: 'rename', target: 'folder', directory: 'domain', fileName: 'old'
    });
  });

  it('updates editable fields and clears stale validation errors', () => {
    const subject = fixture();
    subject.controller.openFileDialog({
      mode: 'save', target: 'file', title: 'Save', directory: '', fileName: '', error: 'old'
    });
    subject.controller.updateDirectory('domain');
    subject.controller.updateFileName('main');
    expect(subject.fileDialog()).toMatchObject({ directory: 'domain', fileName: 'main', error: undefined });
    subject.controller.closeFileDialog();
    expect(subject.fileDialog()).toBeUndefined();
  });

  it('keeps controller validation feedback in the dialog', async () => {
    const subject = fixture();
    subject.controller.newFile('');
    const rejected = { ...subject.fileDialog()!, error: 'File already exists' };
    vi.mocked(subject.commands.submitFileDialog).mockResolvedValueOnce({
      ok: false, reason: 'validation', dialog: rejected
    });

    await subject.controller.confirmFileDialog();
    expect(subject.fileDialog()).toEqual(rejected);
    expect(subject.ports.acceptFileEffect).not.toHaveBeenCalled();
  });

  it('accepts a successful file effect and refreshes dependent state', async () => {
    const subject = fixture();
    subject.controller.newFile('');
    await subject.controller.confirmFileDialog();

    expect(subject.ports.acceptFileEffect).toHaveBeenCalledWith(expect.objectContaining({ kind: 'file-saved' }));
    expect(subject.ports.refreshProjectMetadata).toHaveBeenCalledOnce();
    expect(subject.ports.persistWorkspace).toHaveBeenCalledOnce();
    expect(subject.ports.scheduleLink).toHaveBeenCalledOnce();
    expect(subject.fileDialog()).toBeUndefined();
  });

  it('deletes files and closes only after all accepted effects finish', async () => {
    const subject = fixture();
    subject.controller.deleteFile('main.ai');
    await subject.controller.confirmDeleteDialog();

    expect(subject.ports.acceptDeletedFiles).toHaveBeenCalledWith(['main.ai']);
    expect(subject.deleteDialog()).toBeUndefined();
  });

  it('allows delete confirmation to be dismissed explicitly', () => {
    const subject = fixture();
    subject.controller.deleteFile('main.ai');
    subject.controller.closeDeleteDialog();
    expect(subject.deleteDialog()).toBeUndefined();
  });

  it('preserves a failed delete for retry unless auth redirects', async () => {
    const subject = fixture();
    subject.controller.deleteFolder('domain');
    vi.mocked(subject.commands.deleteItem).mockRejectedValueOnce(new Error('delete failed'));
    await subject.controller.confirmDeleteDialog();
    expect(subject.deleteDialog()?.error).toBe('delete failed');

    vi.mocked(subject.ports.redirectIfAuthRequired).mockReturnValueOnce(true);
    vi.mocked(subject.commands.deleteItem).mockRejectedValueOnce(new Error('auth'));
    await subject.controller.confirmDeleteDialog();
    expect(subject.deleteDialog()?.error).toBe('delete failed');
  });
});
