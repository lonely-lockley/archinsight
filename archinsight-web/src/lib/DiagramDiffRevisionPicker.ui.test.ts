// @vitest-environment happy-dom

import DiagramDiffRevisionPicker from '@archinsight/workbench/diagram-diff-picker';
import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

describe('DiagramDiffRevisionPicker', () => {
  it('shows explicit sides, revision metadata and emits Compare', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onCompare = vi.fn();
    const onSelect = vi.fn();
    const component = mount(DiagramDiffRevisionPicker, {
      target,
      props: {
        state: {
          status: 'ready',
          source: 'model.ai',
          elementId: 'sample/api',
          before: 'before',
          after: 'head',
          catalogue: {
            schemaVersion: 'diagram-diff-revisions.v1',
            workspaceIdentity: '/repo',
            source: 'model.ai',
            currentRevision: 'head',
            revisions: [
              { id: 'head', shortId: 'HEAD', actorName: 'Ada', createdAt: '2026-11-14T10:00:00Z', summary: 'Current', sourcePath: 'model.ai', current: true },
              { id: 'middle', shortId: 'def5678', actorName: 'Grace', createdAt: '2026-11-13T12:00:00Z', summary: 'Middle change', sourcePath: 'model.ai', current: false },
              { id: 'before', shortId: 'abc1234', actorName: 'Linus', createdAt: '2026-11-13T10:00:00Z', summary: 'Older', sourcePath: 'model.ai', current: false },
            ],
          },
        },
        onCompare,
        onSelect,
      },
    });
    await tick();
    const picker = target.querySelector<HTMLElement>('[role="dialog"]');
    expect(picker?.getAttribute('aria-label')).toBe('Compare diagram revisions');
    expect(picker?.classList.contains('archinsight-picker')).toBe(true);
    expect(target.querySelectorAll('.archinsight-picker__control')).toHaveLength(1);
    expect(target.querySelectorAll('.archinsight-picker__button')).toHaveLength(2);
    expect([...target.querySelectorAll('.revision-id')].map((element) => element.textContent)).toEqual(['HEAD', 'def5678', 'abc1234']);
    expect(target.textContent).toContain('Ada');
    expect(target.querySelector('[data-revision-id="head"]')?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('[data-revision-id="middle"]')?.getAttribute('aria-selected')).toBe('false');
    expect(target.querySelector('[data-revision-id="middle"]')?.getAttribute('data-range-position')).toBe('between');
    expect(target.querySelector('[data-revision-id="before"]')?.getAttribute('aria-selected')).toBe('true');
    target.querySelector<HTMLButtonElement>('button.primary')?.click();
    expect(onCompare).toHaveBeenCalledOnce();
    const filter = target.querySelector<HTMLInputElement>('[aria-label="Filter commits"]')!;
    filter.value = 'Grace';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(target.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(target.querySelector('[data-revision-id="middle"]')).not.toBeNull();
    target.querySelector<HTMLButtonElement>('[data-revision-id="middle"]')?.click();
    await tick();
    expect(target.querySelector('[data-revision-id="middle"]')?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector<HTMLButtonElement>('button.primary')?.disabled).toBe(false);
    expect(onSelect).toHaveBeenNthCalledWith(1, 'before', 'middle');
    expect(onSelect).toHaveBeenNthCalledWith(2, 'after', 'head');
    filter.value = '';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(target.querySelector('[data-revision-id="middle"]')?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('[data-revision-id="before"]')?.getAttribute('aria-selected')).toBe('false');
    expect(target.textContent).not.toContain('Select exactly two commits');
    target.querySelector<HTMLButtonElement>('[data-revision-id="before"]')?.click();
    await tick();
    expect(target.querySelector('[data-revision-id="head"]')?.getAttribute('aria-selected')).toBe('true');
    expect(target.querySelector('[data-revision-id="middle"]')?.getAttribute('aria-selected')).toBe('false');
    expect(target.querySelector('[data-revision-id="before"]')?.getAttribute('data-range-position')).toBe('before');
    expect(target.querySelector<HTMLButtonElement>('button.primary')?.disabled).toBe(false);
    expect(onSelect).toHaveBeenNthCalledWith(3, 'before', 'before');
    expect(onSelect).toHaveBeenNthCalledWith(4, 'after', 'head');
    target.querySelector<HTMLButtonElement>('[data-revision-id="head"]')?.click();
    await tick();
    expect(target.querySelector('[data-revision-id="head"]')?.getAttribute('aria-selected')).toBe('false');
    expect(target.querySelector<HTMLButtonElement>('button.primary')?.disabled).toBe(true);
    await unmount(component);
    target.remove();
  });

  it('disables Compare for an untracked source with only HEAD', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(DiagramDiffRevisionPicker, {
      target,
      props: {
        state: {
          status: 'ready', source: 'untracked.ai', elementId: 'sample/api', after: 'head', validationError: 'Select exactly two commits',
          catalogue: {
            schemaVersion: 'diagram-diff-revisions.v1', workspaceIdentity: '/repo', source: 'untracked.ai', currentRevision: 'head',
            revisions: [{ id: 'head', shortId: 'HEAD', actorName: 'Ada', createdAt: '2026-11-14T10:00:00Z', summary: 'Current', sourcePath: 'untracked.ai', current: true }],
          },
        },
      },
    });
    await tick();
    const compare = target.querySelector<HTMLButtonElement>('button.primary');
    expect(compare?.disabled).toBe(true);
    expect(compare?.hasAttribute('title')).toBe(false);
    expect(target.querySelector('.reason')).toBeNull();
    expect(target.textContent).not.toContain('Select exactly two commits');
    expect(target.textContent).not.toContain('No earlier revision is available');
    await unmount(component);
    target.remove();
  });
});
