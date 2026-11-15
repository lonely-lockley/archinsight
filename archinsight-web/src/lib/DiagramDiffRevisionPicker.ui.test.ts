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
              { id: 'before', shortId: 'abc1234', actorName: 'Linus', createdAt: '2026-11-13T10:00:00Z', summary: 'Older', sourcePath: 'model.ai', current: false },
            ],
          },
        },
        onCompare,
        onSelect,
      },
    });
    await tick();
    expect(target.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Compare diagram revisions');
    expect(target.textContent).toContain('Ada');
    expect(target.querySelector<HTMLSelectElement>('[aria-label="Before revision"]')?.value).toBe('before');
    target.querySelector<HTMLButtonElement>('button.primary')?.click();
    expect(onCompare).toHaveBeenCalledOnce();
    const after = target.querySelector<HTMLSelectElement>('[aria-label="After revision"]')!;
    after.value = 'before';
    after.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onSelect).toHaveBeenCalledWith('after', 'before');
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
          status: 'ready', source: 'untracked.ai', elementId: 'sample/api', after: 'head',
          catalogue: {
            schemaVersion: 'diagram-diff-revisions.v1', workspaceIdentity: '/repo', source: 'untracked.ai', currentRevision: 'head',
            revisions: [{ id: 'head', shortId: 'HEAD', actorName: 'Ada', createdAt: '2026-11-14T10:00:00Z', summary: 'Current', sourcePath: 'untracked.ai', current: true }],
          },
        },
      },
    });
    await tick();
    expect(target.querySelector<HTMLButtonElement>('button.primary')?.disabled).toBe(true);
    expect(target.textContent).toContain('No earlier revision is available');
    await unmount(component);
    target.remove();
  });
});
