// @vitest-environment happy-dom

import WorkspaceEditor from '@archinsight/workbench/workspace-editor';
import { mount, tick, unmount } from 'svelte';
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

  it('shows cancellable query loading over the result pane', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancelResult = vi.fn();
    const component = mount(WorkspaceEditor, {
      target,
      props: {
        active: true,
        svg: undefined,
        resultLoading: true,
        diagramMode: 'default',
        query: 'MATCH (n:Element) RETURN TABLE elementId(n) AS id',
        editorHost: document.createElement('div'),
        messagesPanel: document.createElement('div'),
        onCancelResult,
        onSelectDiagramMode: vi.fn(), onToggleQuery: vi.fn(), onQueryChange: vi.fn(),
        onQueryPanelHeightChange: vi.fn(), onZoomIn: vi.fn(), onZoomOut: vi.fn(),
        onFitDiagram: vi.fn(), onActualSize: vi.fn(), onSelectViewMode: vi.fn(),
        onRefresh: vi.fn(), onEditorSplitRatioChange: vi.fn(),
        onDiagramVisibleScaleChange: vi.fn(), onOpenDeclaration: vi.fn(),
        onBeginMessagesResize: vi.fn()
      }
    });
    const status = target.querySelector<HTMLElement>('[role="status"]');
    expect(status?.textContent).toContain('Running query');
    status?.querySelector<HTMLButtonElement>('button')?.click();
    expect(onCancelResult).toHaveBeenCalledOnce();
    await unmount(component);
    target.remove();
  });

  it('keeps Find path visible and cancellable over a table result', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancelFindPath = vi.fn();
    const component = mount(WorkspaceEditor, {
      target,
      props: {
        active: true,
        svg: undefined,
        queryResult: {
          schemaVersion: 'aiq-table.v1',
          kind: 'table',
          columns: [{ name: 'id', type: 'string', nullable: false }],
          rows: [['shop/api']],
          metadata: {
            context: null, source: null, executionComplete: true, rowCount: 1,
            skip: 0, limit: null, pathScopes: [], warnings: []
          }
        },
        findPathMode: { status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API' },
        diagramMode: 'default',
        query: 'MATCH (n:Element) RETURN TABLE elementId(n) AS id',
        editorHost: document.createElement('div'),
        messagesPanel: document.createElement('div'),
        onCancelFindPath,
        onSelectDiagramMode: vi.fn(), onToggleQuery: vi.fn(), onQueryChange: vi.fn(),
        onQueryPanelHeightChange: vi.fn(), onZoomIn: vi.fn(), onZoomOut: vi.fn(),
        onFitDiagram: vi.fn(), onActualSize: vi.fn(), onSelectViewMode: vi.fn(),
        onRefresh: vi.fn(), onEditorSplitRatioChange: vi.fn(),
        onDiagramVisibleScaleChange: vi.fn(), onOpenDeclaration: vi.fn(),
        onBeginMessagesResize: vi.fn()
      }
    });
    await tick();

    expect(target.querySelector('[aria-label="Query table result"]')).not.toBeNull();
    expect(target.textContent).toContain('Find path: API → select target');
    expect(target.querySelector('.toolbar')?.lastElementChild?.getAttribute('aria-label')).toBe('Find path mode');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onCancelFindPath).toHaveBeenCalledOnce();

    await unmount(component);
    target.remove();
  });

  it('exits Find path before selecting another built-in diagram mode', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancelFindPath = vi.fn();
    const onSelectDiagramMode = vi.fn();
    const component = mount(WorkspaceEditor, {
      target,
      props: {
        active: true,
        svg: '<svg></svg>',
        findPathMode: {
          status: 'showing-path', sourceId: 'shop/api', sourceTitle: 'API',
          targetId: 'shop/db', targetTitle: 'Database'
        },
        diagramMode: 'default',
        query: '',
        editorHost: document.createElement('div'),
        messagesPanel: document.createElement('div'),
        onCancelFindPath,
        onSelectDiagramMode,
        onToggleQuery: vi.fn(), onQueryChange: vi.fn(), onQueryPanelHeightChange: vi.fn(),
        onZoomIn: vi.fn(), onZoomOut: vi.fn(), onFitDiagram: vi.fn(),
        onActualSize: vi.fn(), onSelectViewMode: vi.fn(), onRefresh: vi.fn(),
        onEditorSplitRatioChange: vi.fn(), onDiagramVisibleScaleChange: vi.fn(),
        onOpenDeclaration: vi.fn(), onBeginMessagesResize: vi.fn()
      }
    });
    await tick();

    target.querySelector<HTMLButtonElement>('button[aria-label="C2 Containers view"]')?.click();

    expect(onCancelFindPath).toHaveBeenCalledOnce();
    expect(onSelectDiagramMode).toHaveBeenCalledWith('c2');
    expect(onCancelFindPath.mock.invocationCallOrder[0]).toBeLessThan(onSelectDiagramMode.mock.invocationCallOrder[0]!);

    await unmount(component);
    target.remove();
  });

  it('exits Isolate before selecting another built-in diagram mode', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCancelIsolate = vi.fn();
    const onSelectDiagramMode = vi.fn();
    const component = mount(WorkspaceEditor, {
      target,
      props: {
        active: true,
        svg: '<svg></svg>',
        isolateMode: { status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API' },
        diagramMode: 'default',
        query: '',
        editorHost: document.createElement('div'),
        messagesPanel: document.createElement('div'),
        onCancelIsolate,
        onSelectDiagramMode,
        onToggleQuery: vi.fn(), onQueryChange: vi.fn(), onQueryPanelHeightChange: vi.fn(),
        onZoomIn: vi.fn(), onZoomOut: vi.fn(), onFitDiagram: vi.fn(),
        onActualSize: vi.fn(), onSelectViewMode: vi.fn(), onRefresh: vi.fn(),
        onEditorSplitRatioChange: vi.fn(), onDiagramVisibleScaleChange: vi.fn(),
        onOpenDeclaration: vi.fn(), onBeginMessagesResize: vi.fn()
      }
    });
    await tick();

    target.querySelector<HTMLButtonElement>('button[aria-label="C3 Components view"]')?.click();

    expect(onCancelIsolate).toHaveBeenCalledOnce();
    expect(onSelectDiagramMode).toHaveBeenCalledWith('c3');
    expect(onCancelIsolate.mock.invocationCallOrder[0]).toBeLessThan(onSelectDiagramMode.mock.invocationCallOrder[0]!);

    await unmount(component);
    target.remove();
  });
});
