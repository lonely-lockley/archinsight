// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, unmount } from 'svelte';
import { describe, expect, it } from 'vitest';
import WorkspaceTheme from './WorkspaceTheme.svelte';

const workspaceThemeSource = readFileSync(
  resolve(process.cwd(), 'src/lib/workspace/theme/WorkspaceTheme.svelte'),
  'utf8'
);

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

  it('uses a softened quick-action palette on light diagrams', () => {
    expect(workspaceThemeSource).toMatch(
      /\[data-render-theme='light'\][\s\S]*--archinsight-quick-action-bg: #757575;/
    );
    expect(workspaceThemeSource).toMatch(
      /\[data-render-theme='light'\][\s\S]*--archinsight-quick-action-border: #a3a3a3;/
    );
  });
});
