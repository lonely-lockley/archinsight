// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceToolbar from './WorkspaceToolbar.svelte';

const handlers = () => ({
  onNewFile: vi.fn(),
  onSave: vi.fn(),
  onDownloadSource: vi.fn(),
  onDownloadSvg: vi.fn(),
  onDownloadPng: vi.fn(),
  onDownloadDot: vi.fn(),
  onSelectDocumentKind: vi.fn()
});

describe('WorkspaceToolbar document kind', () => {
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
});
