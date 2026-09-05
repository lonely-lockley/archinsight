// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import WorkspaceTabs from './WorkspaceTabs.svelte';

const tab = (overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: 'main.ai',
  filePath: 'main.ai',
  sourceIdentity: 'main.ai',
  title: 'main.ai',
  content: '',
  svg: '',
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

describe('WorkspaceTabs', () => {
  it('renders active, dirty, read-only, and error state without changing titles', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(WorkspaceTabs, {
      target,
      props: {
        tabs: [
          tab({ local: true }),
          tab({ id: 'core.ai', sourceIdentity: 'core.ai', title: 'core.ai', readOnly: true })
        ],
        activeTabId: 'core.ai',
        errorSourceIdentities: new Set(['main.ai']),
        rightPadding: 44,
        onActivate: vi.fn(),
        onClose: vi.fn()
      }
    });

    const tabs = target.querySelector<HTMLElement>('.tabs');
    const items = [...target.querySelectorAll<HTMLElement>('.tab')];
    expect(tabs?.style.paddingRight).toBe('44px');
    expect(items).toHaveLength(2);
    expect(items[0]?.classList.contains('error-tab')).toBe(true);
    expect(items[0]?.querySelector('.dirty')?.textContent).toBe('•');
    expect(items[1]?.classList.contains('active')).toBe(true);
    expect(items[1]?.querySelector('.tab-title-text')?.textContent).toBe('[r] core.ai');
    expect(items[1]?.querySelector('button[aria-label="Close core.ai"]')).not.toBeNull();

    await unmount(component);
    target.remove();
  });

  it('emits activation and close intent for the selected tab', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onActivate = vi.fn();
    const onClose = vi.fn();
    const component = mount(WorkspaceTabs, {
      target,
      props: {
        tabs: [tab()],
        activeTabId: undefined,
        errorSourceIdentities: new Set<string>(),
        rightPadding: 0,
        onActivate,
        onClose
      }
    });

    target.querySelector<HTMLButtonElement>('.tab-main')?.click();
    target.querySelector<HTMLButtonElement>('button[aria-label="Close main.ai"]')?.click();

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onActivate).toHaveBeenCalledWith('main.ai');
    expect(onClose).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith('main.ai');

    await unmount(component);
    target.remove();
  });
});
