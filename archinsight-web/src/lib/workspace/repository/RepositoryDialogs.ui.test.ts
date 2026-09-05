// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '@archinsight/workbench/types';
import RepositoryDeleteDialog from './RepositoryDeleteDialog.svelte';
import RepositoryFileDialog from './RepositoryFileDialog.svelte';

const root: TreeNode = {
  name: 'Project',
  path: '',
  type: 'directory',
  children: []
};

const nested: TreeNode = {
  name: 'domain',
  path: 'src/domain',
  type: 'directory',
  children: []
};

describe('RepositoryFileDialog', () => {
  it('renders controlled directory, filename, preview, and error state', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(RepositoryFileDialog, {
      target,
      props: {
        dialog: {
          mode: 'rename',
          target: 'file',
          title: 'Rename or move',
          directory: 'src/domain',
          fileName: 'main.ai',
          error: 'Repository item already exists'
        },
        directories: [root, nested],
        onCancel: vi.fn(),
        onSubmit: vi.fn(),
        onDirectoryChange: vi.fn(),
        onFileNameChange: vi.fn()
      }
    });

    expect(target.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Rename or move');
    expect(target.querySelector('h2')?.textContent).toBe('Rename or move');
    expect([...target.querySelectorAll('.directory-picker button')].map((button) => button.textContent?.trim()))
      .toEqual(['Project', 'src/domain']);
    expect(target.querySelector('.directory-picker button.active')?.textContent?.trim()).toBe('src/domain');
    expect(target.querySelector<HTMLInputElement>('input')?.value).toBe('main.ai');
    expect(target.querySelector('.target-preview')?.textContent).toBe('src/domain/main');
    expect(target.querySelector('.dialog-error')?.textContent).toBe('Repository item already exists');

    await unmount(component);
    target.remove();
  });

  it('emits directory, filename, submit, and cancel intent without closing on inner clicks', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    const onDirectoryChange = vi.fn();
    const onFileNameChange = vi.fn();
    const component = mount(RepositoryFileDialog, {
      target,
      props: {
        dialog: {
          mode: 'new',
          target: 'folder',
          title: 'New folder',
          directory: '',
          fileName: 'domain.ai'
        },
        directories: [root, nested],
        onCancel,
        onSubmit,
        onDirectoryChange,
        onFileNameChange
      }
    });

    target.querySelector<HTMLElement>('.file-dialog')?.click();
    expect(onCancel).not.toHaveBeenCalled();

    target.querySelectorAll<HTMLButtonElement>('.directory-picker button')[1]?.click();
    const input = target.querySelector<HTMLInputElement>('input');
    expect(input).not.toBeNull();
    input!.value = 'bounded-context';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(onDirectoryChange).toHaveBeenCalledWith('src/domain');
    expect(onFileNameChange).toHaveBeenCalledWith('bounded-context');
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(target.querySelector('.target-preview')?.textContent).toBe('domain.ai');

    target.querySelector<HTMLButtonElement>('footer button[type="button"]')?.click();
    expect(onCancel).toHaveBeenCalledOnce();
    target.querySelector<HTMLElement>('.modal-backdrop')?.click();
    expect(onCancel).toHaveBeenCalledTimes(2);

    await unmount(component);
    target.remove();
  });
});

describe('RepositoryDeleteDialog', () => {
  it('distinguishes recursive folder deletion and reports server errors', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(RepositoryDeleteDialog, {
      target,
      props: {
        dialog: {
          path: 'src/domain',
          target: 'folder',
          error: 'Delete failed'
        },
        onCancel: vi.fn(),
        onSubmit: vi.fn()
      }
    });

    expect(target.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Delete folder');
    expect(target.querySelector('h2')?.textContent).toBe('Delete folder');
    expect(target.querySelector('p')?.textContent).toContain('folder and all files inside it');
    expect(target.querySelector('.target-preview')?.textContent).toBe('src/domain');
    expect(target.querySelector('.dialog-error')?.textContent).toBe('Delete failed');

    await unmount(component);
    target.remove();
  });

  it('renders file deletion and emits submit and cancel intent', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    const component = mount(RepositoryDeleteDialog, {
      target,
      props: {
        dialog: { path: 'main.ai', target: 'file' },
        onCancel,
        onSubmit
      }
    });

    expect(target.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Delete file');
    expect(target.querySelector('p')?.textContent).toContain('delete this file');
    target.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    target.querySelector<HTMLButtonElement>('footer button[type="button"]')?.click();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();

    await unmount(component);
    target.remove();
  });
});
