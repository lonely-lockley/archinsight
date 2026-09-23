// @vitest-environment happy-dom

import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceToolbar from './WorkspaceToolbar.svelte';

const handlers = () => ({
  onNewFile: vi.fn(),
  onSave: vi.fn(),
  onDownloadSource: vi.fn(),
  onDownloadSvg: vi.fn(),
  onDownloadPng: vi.fn(),
  onDownloadDot: vi.fn(),
  onDownloadCsv: vi.fn(),
  onDownloadJson: vi.fn(),
  onSelectDocumentKind: vi.fn()
});

describe('WorkspaceToolbar', () => {
  it('offers a two-state document switch only for unsaved tabs', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const events = handlers();
    const component = mount(WorkspaceToolbar, {
      target,
      props: { ...events, unsavedDocumentKind: 'model' }
    });

    const group = target.querySelector('[aria-label="Document type"]');
    const model = group?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    const query = group?.querySelector<HTMLButtonElement>('button[aria-label="Query (.aiq)"]');
    expect(model?.getAttribute('aria-label')).toBe('Model (.ai)');
    expect(model?.dataset.tooltip).toBe('Model (.ai)');
    expect(model?.querySelector('.codicon-type-hierarchy')).not.toBeNull();
    expect(query?.getAttribute('aria-pressed')).toBe('false');
    expect(query?.dataset.tooltip).toBe('Query (.aiq)');
    expect(query?.querySelector('.codicon-filter-filled')).not.toBeNull();
    const toolbarIcons = [...target.querySelectorAll<HTMLElement>('.workspace-toolbar .codicon')]
      .map((icon) => [...icon.classList].find((name) => name !== 'codicon'));
    expect(new Set(toolbarIcons).size).toBe(toolbarIcons.length);
    query?.click();
    expect(events.onSelectDocumentKind).toHaveBeenCalledWith('query');

    await unmount(component);
    target.replaceChildren();
    const saved = mount(WorkspaceToolbar, { target, props: handlers() });
    expect(target.querySelector('[aria-label="Document type"]')).toBeNull();
    await unmount(saved);
    target.remove();
  });

  it('switches download formats with the active result type', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const events = handlers();
    const component = mount(WorkspaceToolbar, { target, props: events });

    target.querySelector<HTMLButtonElement>('button[aria-label="Download"]')?.click();
    await tick();
    expect([...target.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual([
      'download source',
      'download diagram as svg',
      'download diagram as png',
      'download diagram as DOT'
    ]);

    await unmount(component);
    target.replaceChildren();
    const tableEvents = handlers();
    const table = mount(WorkspaceToolbar, { target, props: { ...tableEvents, tableResult: true } });
    target.querySelector<HTMLButtonElement>('button[aria-label="Download"]')?.click();
    await tick();
    const items = [...target.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    expect(items.map((item) => item.textContent)).toEqual(['download table as CSV', 'download table as JSON']);
    items[0]?.click();
    expect(tableEvents.onDownloadCsv).toHaveBeenCalledOnce();

    await unmount(table);
    target.remove();
  });
});
