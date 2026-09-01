import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceTab } from '$lib/workspace-types';
import {
  createTabController,
  type TabControllerState
} from './tab-controller';

const tab = (id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id,
  filePath: id,
  sourceIdentity: id,
  title: id,
  content: `${id} content`,
  svg: '<svg/>',
  dot: `${id} dot`,
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

describe('tab controller', () => {
  let state: TabControllerState;

  beforeEach(() => {
    state = { tabs: [tab('main.ai')], activeTabId: 'main.ai', editorTabId: 'main.ai' };
  });

  const controller = () => createTabController({
    readState: () => state,
    writeState: (next) => {
      state = next;
    }
  });

  it('appends tabs without changing the active editor identities', () => {
    controller().append(tab('other.ai'));

    expect(state.tabs.map((item) => item.id)).toEqual(['main.ai', 'other.ai']);
    expect(state.activeTabId).toBe('main.ai');
    expect(state.editorTabId).toBe('main.ai');
  });

  it('allocates a unique ID from the current controller state', () => {
    state = {
      ...state,
      tabs: [tab('main.ai'), tab('main.ai-2'), tab('main.ai-3')]
    };

    expect(controller().uniqueId('main.ai')).toBe('main.ai-4');
    expect(controller().uniqueId('other.ai')).toBe('other.ai');
  });

  it('activates a tab without changing the editor model identity', () => {
    state = { ...state, tabs: [...state.tabs, tab('other.ai')] };

    controller().activate('other.ai');

    expect(state.activeTabId).toBe('other.ai');
    expect(state.editorTabId).toBe('main.ai');
  });

  it('selects and clears the editor model identity independently', () => {
    const subject = controller();

    subject.selectEditor('other.ai');
    expect(state.editorTabId).toBe('other.ai');
    expect(state.activeTabId).toBe('main.ai');

    subject.selectEditor(undefined);
    expect(state.editorTabId).toBeUndefined();
  });

  it('patches a tab by ID without mutating unrelated tabs', () => {
    const other = tab('other.ai');
    state = { ...state, tabs: [...state.tabs, other] };

    controller().patch('main.ai', { content: 'changed', local: true });

    expect(state.tabs[0]).toMatchObject({ content: 'changed', local: true });
    expect(state.tabs[1]).toBe(other);
  });

  it('patches every tab with a matching source identity', () => {
    state = {
      ...state,
      tabs: [
        tab('first', { sourceIdentity: 'shared.ai' }),
        tab('second', { sourceIdentity: 'shared.ai' }),
        tab('third')
      ]
    };

    controller().patchBySourceIdentity('shared.ai', { svg: '<svg>updated</svg>' });

    expect(state.tabs.map((item) => item.svg)).toEqual([
      '<svg>updated</svg>',
      '<svg>updated</svg>',
      '<svg/>'
    ]);
  });

  it('replaces diagnostics for every tab from its source identity', () => {
    state = { ...state, tabs: [...state.tabs, tab('other.ai')] };

    controller().replaceDiagnostics((sourceIdentity) => sourceIdentity === 'main.ai'
      ? [{ source: sourceIdentity, level: 'ERROR', code: 'E001', message: 'Broken' }]
      : []);

    expect(state.tabs[0]?.diagnostics).toEqual([
      { source: 'main.ai', level: 'ERROR', code: 'E001', message: 'Broken' }
    ]);
    expect(state.tabs[1]?.diagnostics).toEqual([]);
  });

  it('clears DOT only for selected source identities', () => {
    state = { ...state, tabs: [...state.tabs, tab('other.ai')] };

    controller().clearDots(['main.ai']);

    expect(state.tabs[0]?.dot).toBeUndefined();
    expect(state.tabs[1]?.dot).toBe('other.ai dot');
  });

  it('removes the active tab and selects the last remaining tab', () => {
    state = {
      tabs: [tab('first.ai'), tab('active.ai'), tab('last.ai')],
      activeTabId: 'active.ai',
      editorTabId: 'active.ai'
    };

    const result = controller().remove('active.ai');

    expect(result.activeTabId).toBe('last.ai');
    expect(state.tabs.map((item) => item.id)).toEqual(['first.ai', 'last.ai']);
    expect(state.activeTabId).toBe('last.ai');
    expect(state.editorTabId).toBe('active.ai');
  });

  it('retargets a tab and both active identities', () => {
    const result = controller().retarget('main.ai', {
      path: 'domain/main.ai',
      title: 'main.ai',
      content: 'updated',
      local: true
    });

    expect(result.previousTab?.id).toBe('main.ai');
    expect(state.tabs[0]).toMatchObject({
      id: 'domain/main.ai',
      filePath: 'domain/main.ai',
      sourceIdentity: 'domain/main.ai',
      content: 'updated',
      local: true
    });
    expect(state.activeTabId).toBe('domain/main.ai');
    expect(state.editorTabId).toBe('domain/main.ai');
  });

  it('preserves state when an unknown tab is removed or retargeted', () => {
    const original = state;

    controller().remove('missing.ai');
    const result = controller().retarget('missing.ai', {
      path: 'target.ai',
      title: 'target.ai',
      content: '',
      local: false
    });

    expect(state).toEqual(original);
    expect(result.previousTab).toBeUndefined();
  });

  it('resets all tab and editor identities', () => {
    controller().reset();

    expect(state).toEqual({ tabs: [], activeTabId: undefined, editorTabId: undefined });
  });
});
