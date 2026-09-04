import { describe, expect, it } from 'vitest';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import {
  isProjectSourceTab,
  tabToolbarState,
  virtualSourceIdentity,
  workspaceTabState
} from './tab-persistence';

const tab = (overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: 'main.ai',
  filePath: 'main.ai',
  sourceIdentity: 'main.ai',
  title: 'main.ai',
  content: 'content',
  svg: '<svg/>',
  diagnostics: [],
  local: false,
  diagramMode: 'c2',
  query: 'contexts',
  queryPreset: true,
  queryVisible: true,
  queryPanelHeight: 140,
  diagramScale: 1.5,
  diagramFit: true,
  viewMode: 'diagram',
  editorSplitRatio: 60,
  ...overrides
});

describe('tab persistence', () => {
  it('does not duplicate persisted content for repository files', () => {
    expect(workspaceTabState(tab())).not.toHaveProperty('content');
  });

  it('persists content for unsaved tabs', () => {
    expect(workspaceTabState(tab({ filePath: undefined, id: 'untitled:1' }))).toMatchObject({
      id: 'untitled:1',
      content: 'content'
    });
  });

  it('normalizes invalid and out-of-range toolbar values', () => {
    expect(tabToolbarState({
      title: 'broken',
      id: 'broken',
      diagramScale: Number.NaN,
      editorSplitRatio: 500,
      queryPanelHeight: 20,
      viewMode: 'unknown'
    })).toMatchObject({
      diagramScale: 1,
      editorSplitRatio: 80,
      queryPanelHeight: 80,
      viewMode: 'split'
    });
  });

  it('distinguishes readonly support tabs and sanitizes virtual source identities', () => {
    expect(isProjectSourceTab(tab({ projectSource: false }))).toBe(false);
    expect(isProjectSourceTab(tab())).toBe(true);
    expect(virtualSourceIdentity('Untitled 1/unsafe.ai')).toBe('__unsaved__/Untitled-1-unsafe-ai.ai');
  });
});
