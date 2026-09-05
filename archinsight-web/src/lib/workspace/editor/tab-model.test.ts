import { describe, expect, it } from 'vitest';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import { removeTab, retargetTab, uniqueTabId } from './tab-model';

const tab = (id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id,
  filePath: id,
  sourceIdentity: id,
  title: id,
  content: `${id} content`,
  svg: '<svg/>',
  diagnostics: [],
  local: false,
  diagramMode: 'default',
  query: '',
  queryPreset: true,
  queryVisible: false,
  diagramScale: 1,
  diagramFit: false,
  viewMode: 'split',
  editorSplitRatio: 50,
  queryPanelHeight: 118,
  ...overrides
});

describe('workspace tab model', () => {
  it('allocates stable IDs and increments through collisions', () => {
    const tabs = [tab('main.ai'), tab('main.ai-2'), tab('main.ai-3')];

    expect(uniqueTabId(tabs, 'other.ai')).toBe('other.ai');
    expect(uniqueTabId(tabs, 'main.ai')).toBe('main.ai-4');
  });

  it('retargets a tab and updates active editor identities', () => {
    const original = tab('src/main.ai', {
      diagnostics: [{
        source: 'src/main.ai',
        level: 'ERROR',
        code: 'E001',
        message: 'Broken'
      }]
    });
    const other = tab('other.ai');

    const result = retargetTab(
      [original, other],
      original.id,
      { path: 'domain/main.ai', title: 'main.ai', content: 'updated', local: true },
      original.id,
      original.id
    );

    expect(result.targetId).toBe('domain/main.ai');
    expect(result.previousTab).toBe(original);
    expect(result.activeTabId).toBe('domain/main.ai');
    expect(result.editorTabId).toBe('domain/main.ai');
    expect(result.tabs).toEqual([
      {
        ...original,
        id: 'domain/main.ai',
        filePath: 'domain/main.ai',
        sourceIdentity: 'domain/main.ai',
        title: 'main.ai',
        content: 'updated',
        local: true,
        diagnostics: []
      },
      other
    ]);
  });

  it('preserves existing ID collision behavior during retargeting', () => {
    const source = tab('source.ai');
    const occupied = tab('target.ai');

    const result = retargetTab(
      [source, occupied],
      source.id,
      { path: 'target.ai', title: 'target.ai', content: source.content, local: false },
      occupied.id,
      undefined
    );

    expect(result.targetId).toBe('target.ai-2');
    expect(result.activeTabId).toBe('target.ai');
    expect(result.tabs.map((item) => item.id)).toEqual(['target.ai-2', 'target.ai']);
  });

  it('does nothing when the tab to retarget is absent', () => {
    const tabs = [tab('main.ai')];

    const result = retargetTab(
      tabs,
      'missing.ai',
      { path: 'target.ai', title: 'target.ai', content: '', local: false },
      'main.ai',
      'main.ai'
    );

    expect(result.targetId).toBeUndefined();
    expect(result.previousTab).toBeUndefined();
    expect(result.tabs).toEqual(tabs);
    expect(result.activeTabId).toBe('main.ai');
    expect(result.editorTabId).toBe('main.ai');
  });

  it('selects the last remaining tab when the active tab closes', () => {
    const first = tab('first.ai');
    const active = tab('active.ai');
    const last = tab('last.ai');

    expect(removeTab([first, active, last], active.id, active.id)).toEqual({
      tabs: [first, last],
      activeTabId: last.id
    });
    expect(removeTab([active], active.id, active.id)).toEqual({
      tabs: [],
      activeTabId: undefined
    });
  });

  it('keeps the active ID when another or an unknown tab closes', () => {
    const active = tab('active.ai');
    const other = tab('other.ai');

    expect(removeTab([active, other], active.id, other.id)).toEqual({
      tabs: [active],
      activeTabId: active.id
    });
    expect(removeTab([active], active.id, 'missing.ai')).toEqual({
      tabs: [active],
      activeTabId: active.id
    });
  });
});
