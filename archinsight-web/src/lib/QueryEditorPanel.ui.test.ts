// @vitest-environment happy-dom

import { BUILTIN_VIEW_DEFINITIONS } from '@insight/language';
import { mount, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import QueryEditorPanel from './QueryEditorPanel.svelte';

describe('QueryEditorPanel built-in views', () => {
  it('renders every stable catalogue entry and maps the no-filter alias', async () => {
    const target = document.createElement('div');
    document.body.append(target);
    const onSelectDiagramMode = vi.fn();
    const component = mount(QueryEditorPanel, {
      target,
      props: {
        diagramMode: 'c1',
        query: '',
        onSelectDiagramMode,
        onToggleQuery: vi.fn(),
        onQueryChange: vi.fn(),
        onQueryPanelHeightChange: vi.fn()
      }
    });

    const stableDefinitions = BUILTIN_VIEW_DEFINITIONS.filter((definition) => definition.lifecycle === 'stable');
    for (const definition of stableDefinitions) {
      const button = target.querySelector<HTMLButtonElement>(`button[aria-label="${definition.label} view"]`);
      expect(button, definition.id).not.toBeNull();
      expect(button?.textContent).toContain(definition.shortLabel);
      button?.click();
    }

    expect(onSelectDiagramMode.mock.calls.map(([mode]) => mode)).toEqual(
      stableDefinitions.map((definition) => definition.id === 'no-filter' ? 'default' : definition.id)
    );
    expect(target.textContent).not.toContain('Deployment (legacy)');

    await unmount(component);
    target.remove();
  });
});
