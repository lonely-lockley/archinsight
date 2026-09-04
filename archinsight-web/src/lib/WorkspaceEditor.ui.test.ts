// @vitest-environment happy-dom

import WorkspaceEditor from '@archinsight/workbench/workspace-editor';
import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

describe('WorkspaceEditor composition', () => {
  it('renders the inactive workbench and forwards its empty-state action', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onEmptyAction = vi.fn();
    const action = {
      id: 'manage-projects' as const,
      label: 'Manage projects',
      icon: 'folder-opened',
      primary: true
    };
    const component = mount(WorkspaceEditor, {
      target,
      props: {
        active: false,
        svg: undefined,
        diagramMode: 'default',
        query: '',
        editorHost: document.createElement('div'),
        messagesPanel: document.createElement('div'),
        emptyStrategy: { kind: 'no-projects', actions: [action] },
        onEmptyAction,
        onSelectDiagramMode: vi.fn(),
        onToggleQuery: vi.fn(),
        onQueryChange: vi.fn(),
        onQueryPanelHeightChange: vi.fn(),
        onZoomIn: vi.fn(),
        onZoomOut: vi.fn(),
        onFitDiagram: vi.fn(),
        onActualSize: vi.fn(),
        onSelectViewMode: vi.fn(),
        onRefresh: vi.fn(),
        onEditorSplitRatioChange: vi.fn(),
        onDiagramVisibleScaleChange: vi.fn(),
        onOpenDeclaration: vi.fn(),
        onBeginMessagesResize: vi.fn()
      }
    });

    const button = target.querySelector<HTMLButtonElement>('button[aria-label="Manage projects"]');
    expect(target.querySelector('.workspace-editor.inactive')).not.toBeNull();
    expect(button).not.toBeNull();

    button?.click();
    expect(onEmptyAction).toHaveBeenCalledOnce();
    expect(onEmptyAction).toHaveBeenCalledWith(action);

    await unmount(component);
    target.remove();
  });
});
