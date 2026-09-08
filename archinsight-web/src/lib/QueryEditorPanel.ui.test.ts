// @vitest-environment happy-dom

import { BUILTIN_VIEW_DEFINITIONS } from '@insight/language';
import { mount, tick, unmount } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import QueryEditorPanel from '@archinsight/workbench/query-editor-panel';

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


it('offers named custom views and file navigation while keeping scope widgets out of the source panel', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  const select = vi.fn();
  const open = vi.fn();
  const component = mount(QueryEditorPanel, { target, props: {
    diagramMode: 'c2', query: 'WHERE n.sourceIdentity = $tab',
    projectQueries: [{ name: 'c2', paths: ['c2.aiq'], view: 'c2' }, { name: 'impact', paths: ['impact.aiq'] }],
    onSelectProjectQuery: select, onOpenQueryFile: open,
    onSelectDiagramMode: vi.fn(), onToggleQuery: vi.fn(), onQueryChange: vi.fn(), onQueryPanelHeightChange: vi.fn()
  } });
  const trigger = target.querySelector<HTMLButtonElement>('[aria-label="Custom view"]')!;
  expect(trigger.parentElement?.parentElement?.getAttribute('aria-label')).toBe('View query preset');
  expect(trigger.parentElement?.parentElement?.lastElementChild).toBe(trigger.parentElement);
  expect(target.querySelector('.toolbar > [aria-label="Open query file"]')).toBeNull();
  trigger.click();
  await tick();
  const choices = [...target.querySelectorAll<HTMLButtonElement>('.custom-view-choice')];
  expect(choices.map((item) => item.textContent?.trim())).toEqual(['impact']);
  choices[0]?.click();
  expect(select).toHaveBeenCalledWith('impact');
  trigger.click();
  await tick();
  target.querySelector<HTMLButtonElement>('[aria-label="Go to impact query file"]')?.click();
  expect(open).toHaveBeenCalledWith('impact.aiq');
  expect(target.querySelector('.query-scope-chip')).toBeNull();
  expect(target.querySelector('[aria-label="Edit query"]')).not.toBeNull();
  await unmount(component);
  target.remove();
});

it('shows the selected custom view as active in the preset group', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(QueryEditorPanel, { target, props: {
    diagramMode: 'c2', query: '', selectedQuery: 'impact',
    projectQueries: [{ name: 'impact', paths: ['impact.aiq'] }],
    onSelectDiagramMode: vi.fn(), onToggleQuery: vi.fn(), onQueryChange: vi.fn(), onQueryPanelHeightChange: vi.fn()
  } });
  expect(target.querySelector('[aria-label="Custom view"]')?.classList.contains('active-mode')).toBe(true);
  expect(target.querySelector('[aria-label="Custom view"]')?.textContent).toContain('impact');
  expect(target.querySelector('[aria-label="C2 Containers view"]')?.classList.contains('active-mode')).toBe(false);
  await unmount(component);
  target.remove();
});

it('does not open a second query editor or change view selection when editing an aiq document', async () => {
  const target = document.createElement('div');
  document.body.append(target);
  const component = mount(QueryEditorPanel, { target, props: {
    diagramMode: 'c2', query: '', queryDocument: true, queryVisible: true,
    onSelectDiagramMode: vi.fn(), onToggleQuery: vi.fn(), onQueryChange: vi.fn(), onQueryPanelHeightChange: vi.fn()
  } });
  expect(target.querySelector('[aria-label="Edit query"]')).toBeNull();
  expect(target.querySelector('[aria-label="Graph query"]')).toBeNull();
  expect(target.querySelector('[aria-label="C2 Containers view"]')).toBeNull();
  await unmount(component);
  target.remove();
});
