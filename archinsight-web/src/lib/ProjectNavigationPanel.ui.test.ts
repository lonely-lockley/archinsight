// @vitest-environment happy-dom

import { coreLanguageSnapshot } from '@insight/language';
import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import ProjectNavigationPanel from './ProjectNavigationPanel.svelte';

describe('ProjectNavigationPanel controls', () => {
  it('labels the messages control as Output only in the expanded sidebar', async () => {
    const onToggleMessages = vi.fn();
    const expandedTarget = document.createElement('div');
    const expanded = mount(ProjectNavigationPanel, {
      target: expandedTarget,
      props: props(true, onToggleMessages)
    });
    const expandedButton = expandedTarget.querySelector<HTMLButtonElement>(
      'button[aria-label="Show messages"]'
    );

    expect(expandedButton?.textContent).toContain('Output');
    expandedButton?.click();
    expect(onToggleMessages).toHaveBeenCalledOnce();

    await unmount(expanded);

    const collapsedTarget = document.createElement('div');
    const collapsed = mount(ProjectNavigationPanel, {
      target: collapsedTarget,
      props: props(false, vi.fn())
    });
    expect(collapsedTarget.querySelector<HTMLButtonElement>(
      'button[aria-label="Show messages"]'
    )?.textContent).not.toContain('Output');

    await unmount(collapsed);
  });
});

function props(visible: boolean, onToggleMessages: () => void) {
  return {
    tree: undefined,
    hasActiveProject: false,
    symbols: coreLanguageSnapshot,
    structure: undefined,
    structureLoading: false,
    activePath: undefined,
    errorPaths: new Set<string>(),
    ui: {
      sidebarVisible: visible,
      sidebarWidth: 300,
      messagesVisible: false,
      messagesHeight: 180
    },
    visible,
    onOpen: vi.fn(),
    onRepositoryContextMenu: vi.fn(),
    onOpenDeclaration: vi.fn(),
    onShowSidebar: vi.fn(),
    onToggleSidebar: vi.fn(),
    onToggleMessages,
    onBeginSidebarResize: vi.fn()
  };
}
