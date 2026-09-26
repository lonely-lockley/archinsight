// @vitest-environment happy-dom

import { mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import WorkspaceTheme from './WorkspaceTheme.svelte';

describe('WorkspaceTheme', () => {
  it.each([
    ['dark'],
    ['light']
  ] as const)('applies the %s palette to the workspace root', async (theme) => {
    const target = document.createElement('div');
    document.body.append(target);
    const component = mount(WorkspaceTheme, { target, props: { theme } });
    const surface = target.querySelector<HTMLElement>('.workspace-theme');

    expect(surface?.dataset.renderTheme).toBe(theme);
    expect(surface?.classList.contains('workspace-theme')).toBe(true);

    await unmount(component);
    target.remove();
  });
});
