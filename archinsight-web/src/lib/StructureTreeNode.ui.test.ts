// @vitest-environment happy-dom

import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import StructureTreeNode from './StructureTreeNode.svelte';
import type { StructureTreeNodeModel } from './workspace-types';

describe('StructureTreeNode', () => {
  it('opens a non-leaf declaration from its row and folds it only from the chevron', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const openDeclaration = vi.fn();
    const node: StructureTreeNodeModel = {
      id: 'context:commerce',
      label: 'commerce',
      kind: 'context',
      icon: 'symbol-namespace',
      declaration: { source: 'commerce.ai', line: 1, column: 1 },
      children: [{
        id: 'element:storefront',
        label: 'storefront',
        kind: 'element',
        icon: 'symbol-variable',
        declaration: { source: 'commerce.ai', line: 3, column: 1 },
        children: []
      }]
    };
    const component = mount(StructureTreeNode, {
      target,
      props: { node, onOpenDeclaration: openDeclaration }
    });

    const row = target.querySelector<HTMLButtonElement>('.node-content');
    row?.click();
    await tick();

    expect(openDeclaration).toHaveBeenCalledOnce();
    expect(openDeclaration).toHaveBeenCalledWith(node.declaration);
    expect(target.textContent).toContain('storefront');

    const chevron = target.querySelector<HTMLButtonElement>('.chevron');
    chevron?.click();
    await tick();

    expect(openDeclaration).toHaveBeenCalledOnce();
    expect(target.textContent).not.toContain('storefront');

    await unmount(component);
    target.remove();
  });
});
