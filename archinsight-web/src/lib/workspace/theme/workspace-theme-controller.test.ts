import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import type { RenderTheme } from '@insight/language';
import { createWorkspaceThemeController } from './workspace-theme-controller';

const tab = (overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: 'main.ai', filePath: 'main.ai', sourceIdentity: 'main.ai', title: 'main.ai', content: '',
  svg: '<svg/>', dot: 'digraph {}', diagnostics: [], local: false, diagramMode: 'default',
  query: '', queryPreset: true, queryVisible: false, queryPanelHeight: 118, diagramScale: 1,
  diagramFit: false, viewMode: 'split', editorSplitRatio: 50, ...overrides
});

describe('workspace theme controller', () => {
  it('applies the initial theme and refreshes a graph on later changes', () => {
    let theme: RenderTheme = 'dark';
    let listener: ((theme: RenderTheme) => void) | undefined;
    const setEditorTheme = vi.fn();
    const scheduleDiagramUpdate = vi.fn();
    const controller = createWorkspaceThemeController({
      source: {
        current: () => 'light',
        subscribe: (next) => { listener = next; return vi.fn(); }
      },
      theme: () => theme,
      setTheme: (next) => { theme = next; },
      setEditorTheme,
      activeTab: () => tab(),
      scheduleDiagramUpdate
    });

    controller.start();
    expect(theme).toBe('light');
    expect(setEditorTheme).toHaveBeenCalledWith('light');
    expect(scheduleDiagramUpdate).not.toHaveBeenCalled();

    listener?.('dark');
    expect(scheduleDiagramUpdate).toHaveBeenCalledOnce();
  });

  it('does not rerun table results and removes its listener on dispose', () => {
    let listener: ((theme: RenderTheme) => void) | undefined;
    const unsubscribe = vi.fn();
    const scheduleDiagramUpdate = vi.fn();
    let theme: RenderTheme = 'dark';
    const controller = createWorkspaceThemeController({
      source: {
        current: () => 'dark',
        subscribe: (next) => { listener = next; return unsubscribe; }
      },
      theme: () => theme,
      setTheme: (next) => { theme = next; },
      setEditorTheme: vi.fn(),
      activeTab: () => tab({ queryResult: {
        schemaVersion: 'aiq-table.v1', kind: 'table', columns: [], rows: [],
        metadata: { context: null, source: null, executionComplete: true, rowCount: 0,
          skip: 0, limit: null, pathScopes: [], warnings: [] }
      } }),
      scheduleDiagramUpdate
    });

    controller.start();
    listener?.('light');
    expect(scheduleDiagramUpdate).not.toHaveBeenCalled();
    controller.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
