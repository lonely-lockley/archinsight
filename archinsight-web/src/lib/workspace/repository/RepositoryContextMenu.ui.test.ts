// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { ControlState } from '$lib/actions/action-model';
import type { TreeNode } from '$lib/workspace-types';
import RepositoryContextMenu from './RepositoryContextMenu.svelte';

const enabled: ControlState = { hidden: false, disabled: false };

function actions(overrides: Partial<Record<keyof ActionProps, ControlState>> = {}): ActionProps {
  return {
    createFile: enabled,
    createFolder: enabled,
    renameFile: enabled,
    renameFolder: enabled,
    deleteFile: enabled,
    deleteFolder: enabled,
    ...overrides
  };
}

type ActionProps = {
  createFile: ControlState;
  createFolder: ControlState;
  renameFile: ControlState;
  renameFolder: ControlState;
  deleteFile: ControlState;
  deleteFolder: ControlState;
};

function node(path: string, type: TreeNode['type']): TreeNode {
  return { name: path || 'Project', path, type, children: [] };
}

function callbacks() {
  return {
    onClose: vi.fn(),
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onRenameFile: vi.fn(),
    onRenameFolder: vi.fn(),
    onDeleteFile: vi.fn(),
    onDeleteFolder: vi.fn()
  };
}

describe('RepositoryContextMenu', () => {
  it('shows only create actions for the repository root and preserves position', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const handlers = callbacks();
    const component = mount(RepositoryContextMenu, {
      target,
      props: {
        menu: { node: node('', 'directory'), x: 24, y: 48 },
        actions: actions(),
        ...handlers
      }
    });

    expect(target.querySelector('[role="menu"]')?.getAttribute('style')).toContain('left: 24px');
    expect([...target.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim()))
      .toEqual(['New file', 'New folder']);

    await unmount(component);
    target.remove();
  });

  it('renders folder action policy and emits the selected directory intents', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const handlers = callbacks();
    const component = mount(RepositoryContextMenu, {
      target,
      props: {
        menu: { node: node('src/domain', 'directory'), x: 0, y: 0 },
        actions: actions({
          createFolder: { hidden: true, disabled: true, reason: 'Hidden' },
          deleteFolder: { hidden: false, disabled: true, reason: 'Read only' }
        }),
        ...handlers
      }
    });

    const buttons = [...target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['New file', 'Rename / Move', 'Delete']);
    expect(buttons[2]?.disabled).toBe(true);
    expect(buttons[2]?.title).toBe('Read only');
    buttons[0]?.click();
    buttons[1]?.click();

    expect(handlers.onNewFile).toHaveBeenCalledWith('src/domain');
    expect(handlers.onRenameFolder).toHaveBeenCalledWith('src/domain');
    expect(handlers.onNewFolder).not.toHaveBeenCalled();
    expect(handlers.onDeleteFolder).not.toHaveBeenCalled();

    await unmount(component);
    target.remove();
  });

  it('renders file actions, emits their path, and closes on Escape', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const handlers = callbacks();
    const component = mount(RepositoryContextMenu, {
      target,
      props: {
        menu: { node: node('src/main.ai', 'file'), x: 0, y: 0 },
        actions: actions(),
        ...handlers
      }
    });

    const menu = target.querySelector<HTMLElement>('[role="menu"]');
    const buttons = [...target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    buttons[0]?.click();
    buttons[1]?.click();
    menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(handlers.onRenameFile).toHaveBeenCalledWith('src/main.ai');
    expect(handlers.onDeleteFile).toHaveBeenCalledWith('src/main.ai');
    expect(handlers.onClose).toHaveBeenCalledOnce();

    await unmount(component);
    target.remove();
  });
});
