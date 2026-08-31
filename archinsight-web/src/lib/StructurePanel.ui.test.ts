// @vitest-environment happy-dom

import { coreLanguageSnapshot, type LanguageSnapshot } from '@insight/language';
import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import StructurePanel from './StructurePanel.svelte';
import type { ProjectStructure } from './api';

describe('StructurePanel filters', () => {
  it('always shows project types and toggles language types, operators, and identifiers', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const symbols: LanguageSnapshot = {
      ...coreLanguageSnapshot,
      types: [
        ...coreLanguageSnapshot.types,
        {
          name: 'ProjectConcept',
          baseType: 'Element',
          declaration: { sourceName: 'definitions.ai', line: 1, column: 13 }
        }
      ]
    };
    const structure: ProjectStructure = {
      schemaVersion: 'project-structure.v1',
      contexts: [{
        id: 'commerce',
        kind: 'context',
        constructor: 'Context',
        source: 'commerce.ai',
        line: 1,
        column: 1,
        children: []
      }]
    };
    const coreOperator = coreLanguageSnapshot.operators[0]?.ownerType;
    expect(coreOperator).toBeDefined();

    const component = mount(StructurePanel, {
      target,
      props: {
        symbols,
        structure,
        onOpenDeclaration: vi.fn()
      }
    });
    const labels = (): string[] => [...target.querySelectorAll('.label')].map((item) => item.textContent ?? '');

    expect(labels()).toContain('ProjectConcept');
    expect(labels()).toContain('commerce');
    expect(labels()).not.toContain('Element');
    expect(labels()).not.toContain(coreOperator);

    target.querySelector<HTMLButtonElement>('button[aria-label="Show language types"]')?.click();
    target.querySelector<HTMLButtonElement>('button[aria-label="Show operators"]')?.click();
    target.querySelector<HTMLButtonElement>('button[aria-label="Show declared identifiers"]')?.click();
    await tick();

    expect(labels()).toContain('ProjectConcept');
    expect(labels()).toContain('Element');
    expect(labels()).toContain(coreOperator);
    expect(labels()).not.toContain('commerce');

    await unmount(component);
    target.remove();
  });
});
