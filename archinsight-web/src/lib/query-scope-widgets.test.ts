// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as Monaco from 'monaco-editor';
import {
  resolveQueryScopeState,
  selectQueryScope,
  type QueryScopeWidgetState
} from '@archinsight/workbench/query-scope-state';
import { createQueryScopeWidgets } from '@archinsight/workbench/query-scope-widgets';
import { registerQueryLanguage } from '@archinsight/workbench/query-monaco';
import { readFileSync } from 'node:fs';

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); document.body.replaceChildren(); });
function fixture() {
  let content = "WHERE n.sourceIdentity = $tab OR n.sourceIdentity = $tab AND n.context = $context # $tab";
  let state: QueryScopeWidgetState = { enabled: true, sources: [{ value: 'a.ai', label: 'a.ai' }, { value: 'b.ai', label: 'b.ai' }], contexts: [{ value: 'one', label: 'one' }] };
  let currentModel: object | null = {};
  let position = { lineNumber: 1, column: content.indexOf('$tab') + 1 };
  const events: Record<string, (...args: any[]) => void> = {};
  const subscribe = (name: string) => (listener: (...args: any[]) => void) => { events[name] = listener; return { dispose: vi.fn() }; };
  const model = { getValue: () => content, getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }), getOffsetAt: (pos: { column: number }) => pos.column - 1 };
  const decorations = { set: vi.fn(), clear: vi.fn() };
  const editor = {
    createDecorationsCollection: () => decorations, getModel: () => currentModel === null ? null : model, getPosition: () => position,
    onDidChangeModel: subscribe('model'), onDidChangeModelContent: subscribe('content'), onMouseDown: subscribe('mouse'),
    addAction: (action: { run(): void }) => { events.action = action.run; return { dispose: vi.fn() }; },
    addContentWidget: (widget: Monaco.editor.IContentWidget) => { document.body.append(widget.getDomNode()); },
    removeContentWidget: (widget: Monaco.editor.IContentWidget) => { widget.getDomNode().remove(); }, focus: vi.fn()
  };
  const monaco = {
    Range: class { constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {} },
    editor: { ContentWidgetPositionPreference: { BELOW: 1, ABOVE: 2 }, InjectedTextCursorStops: { None: 3 }, MouseTargetType: { CONTENT_TEXT: 6 } },
    KeyMod: { CtrlCmd: 1, Alt: 2 }, KeyCode: { Enter: 3 }
  };
  const select = vi.fn((variable: string, value: string) => { state = { ...state, [variable]: value }; });
  const widget = createQueryScopeWidgets(monaco as unknown as typeof Monaco, editor as unknown as Monaco.editor.IStandaloneCodeEditor, { state: () => state, select });
  cleanups.push(widget.dispose);
  return { widget, decorations, events, editor, select, content: () => content,
    setContent: (text: string) => { content = text; events.content(); },
    setPosition: (column: number) => { position = { lineNumber: 1, column }; },
    setState: (next: Partial<QueryScopeWidgetState>) => { state = { ...state, ...next }; widget.refresh(); },
    removeModel: () => { currentModel = null; events.model(); }
  };
}

describe('shared query scope model', () => {
  const sources = [
    { value: 'other.ai', label: 'other.ai' },
    { value: 'shop.ai', label: 'shop.ai', typeName: 'Context' }
  ];
  const contexts = [
    { value: 'shop', label: 'shop', typeName: 'Context', sourceIdentity: 'shop.ai' },
    { value: 'other', label: 'other', sourceIdentity: 'other.ai' },
    { value: 'shop', label: 'shop', typeName: 'Context', sourceIdentity: 'extension.ai' }
  ];

  it('infers context from $tab and exposes unique sorted choices', () => {
    expect(resolveQueryScopeState(true, sources, contexts, { tab: 'shop.ai', context: 'other' })).toEqual({
      enabled: true,
      tab: 'shop.ai',
      context: 'shop',
      sources: [sources[0], sources[1]],
      contexts: [
        { value: 'other', label: 'other' },
        { value: 'shop', label: 'shop', typeName: 'Context' }
      ]
    });
  });

  it('uses the same selection transitions for web and VS Code hosts', () => {
    const unselected = resolveQueryScopeState(true, sources, contexts, {});
    expect(selectQueryScope(unselected, contexts, {}, 'tab', 'shop.ai')).toEqual({ tab: 'shop.ai' });
    const selected = resolveQueryScopeState(true, sources, contexts, { tab: 'shop.ai' });
    expect(selectQueryScope(selected, contexts, { tab: 'shop.ai' }, 'context', 'shop'))
      .toEqual({ tab: 'shop.ai', context: 'shop' });
    expect(selectQueryScope(selected, contexts, { tab: 'shop.ai' }, 'context', 'other'))
      .toEqual({ context: 'other' });
    expect(selectQueryScope(selected, contexts, { tab: 'shop.ai' }, 'tab', 'missing.ai')).toBeUndefined();
  });
});

describe('query scope decorations', () => {
  it('places the picker above the Monaco minimap', () => {
    const subject = fixture();
    const styles = document.createElement('style');
    styles.textContent = [
      '../../../packages/archinsight-workbench/src/query-scope-widgets.css',
      '../../node_modules/monaco-editor/esm/vs/editor/browser/viewParts/minimap/minimap.css'
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    const editor = document.createElement('div');
    editor.className = 'monaco-editor';
    const minimap = document.createElement('div');
    minimap.className = 'minimap';
    editor.append(minimap);
    document.body.append(styles, editor);
    subject.events.action();
    const picker = document.querySelector<HTMLElement>('.query-scope-picker')!;
    editor.append(picker);
    expect(Number(getComputedStyle(picker).zIndex)).toBeGreaterThan(Number(getComputedStyle(minimap).zIndex));
  });

  it.each(['tab', 'context'] as const)('shows and searches semantic types in the %s picker without changing its value', (variable) => {
    const subject = fixture();
    const text = subject.content();
    const choices = [
      { value: 'commerce', label: 'Commerce', typeName: 'Context' },
      { value: 'eu', label: 'Europe', typeName: 'RegionCatalog' },
      { value: 'untyped', label: 'Unknown' }
    ];
    subject.setState(variable === 'tab' ? { sources: choices, tab: 'eu' } : { contexts: choices, context: 'eu' });
    subject.setPosition(text.indexOf(`$${variable}`) + 1);
    subject.events.action();
    const options = [...document.querySelectorAll('[role=option]')];
    expect(options.map((option) => option.querySelector('.query-scope-option-label')?.textContent)).toEqual(['Commerce', 'Europe', 'Unknown']);
    expect(options.map((option) => option.querySelector('.query-scope-option-type')?.textContent)).toEqual(['Context', 'RegionCatalog', undefined]);
    expect(options.map((option) => option.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(options[1].getAttribute('aria-label')).toBe('Europe, RegionCatalog');
    const search = document.querySelector('input')!;
    search.value = 'regioncatalog';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('[role=option]')).toHaveLength(1);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(subject.select).toHaveBeenCalledWith(variable, 'eu');
    expect(subject.content()).toBe(text);
  });

  it('decorates every real occurrence without altering the text and clears on model switch', () => {
    const subject = fixture();
    const text = subject.content();
    expect(subject.decorations.set.mock.lastCall?.[0].map((item: any) => item.options.after.content)).toEqual([' [Select file ▾]', ' [Select file ▾]', ' [Select context ▾]']);
    expect(subject.decorations.set.mock.lastCall?.[0].every((item: any) => item.options.showIfCollapsed === true)).toBe(true);
    subject.setState({ tab: 'a.ai', context: 'one' });
    expect(subject.decorations.set.mock.lastCall?.[0].map((item: any) => item.options.after.content)).toEqual([' [a.ai ▾]', ' [a.ai ▾]', ' [one ▾]']);
    expect(subject.content()).toBe(text);
    subject.setState({ enabled: false });
    expect(subject.decorations.clear).toHaveBeenCalled();
    subject.events.action();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    subject.removeModel();
    expect(subject.decorations.clear).toHaveBeenCalledTimes(2);
  });
  it('opens a searchable picker using the keyboard and selects without editing the query', () => {
    const subject = fixture();
    const text = subject.content();
    subject.events.action();
    const search = document.querySelector('input')!;
    expect(document.activeElement).toBe(search);
    search.value = 'b.';
    search.dispatchEvent(new Event('input'));
    expect([...document.querySelectorAll('[role=option]')].map((node) => node.textContent)).toEqual(['b.ai']);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(subject.select).toHaveBeenCalledWith('tab', 'b.ai');
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(subject.editor.focus).toHaveBeenCalled();
    expect(subject.content()).toBe(text);
    expect(subject.decorations.set.mock.lastCall?.[0][1].options.after.content).toBe(' [b.ai ▾]');
  });
  it('opens the clicked context chip and supports arrows and Escape', () => {
    const subject = fixture();
    const chip = document.createElement('span');
    chip.className = 'query-scope-chip';
    const offset = subject.content().indexOf('$context') + '$context'.length;
    subject.events.mouse({ target: { type: 6, element: chip, position: { lineNumber: 1, column: offset + 1 } }, event: { preventDefault: vi.fn() } });
    expect(document.querySelector('[role=dialog]')?.getAttribute('aria-label')).toBe('Select query context');
    document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement?.textContent).toBe('one');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(subject.select).not.toHaveBeenCalled();
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('ignores normal text clicks and closes stale popups on edits, outside clicks and focus changes', () => {
    const subject = fixture();
    subject.events.mouse({ target: { type: 2 } });
    subject.events.mouse({ target: { type: 6, element: document.createElement('span'), position: null } });
    expect(document.querySelector('[role=dialog]')).toBeNull();
    subject.events.action();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.querySelector('[role=dialog]')).toBeNull();
    subject.events.action();
    document.querySelector('input')!.dispatchEvent(new FocusEvent('focusout', { relatedTarget: document.body, bubbles: true }));
    expect(document.querySelector('[role=dialog]')).toBeNull();
    subject.events.action();
    subject.setContent("'$tab");
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(subject.decorations.set.mock.lastCall?.[0]).toEqual([]);
    subject.events.action();
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('handles empty choices and query documents with no variables', () => {
    const subject = fixture();
    subject.setState({ sources: [] });
    subject.setPosition(1);
    subject.events.action();
    expect(document.querySelector('[role=listbox]')?.textContent).toBe('No matching choices');
    document.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    subject.setContent('MATCH (n) RETURN n');
    expect(subject.decorations.set.mock.lastCall?.[0]).toEqual([]);
    subject.events.action();
    expect(document.querySelector('[role=dialog]')).toBeNull();
  });
  it('registers query highlighting once per Monaco runtime', () => {
    const languages = { getLanguages: vi.fn(() => [] as { id: string }[]), register: vi.fn(), setMonarchTokensProvider: vi.fn() };
    registerQueryLanguage({ languages } as unknown as typeof Monaco);
    expect(languages.register).toHaveBeenCalledWith({ id: 'archinsight-query', extensions: ['.aiq'] });
    const language = languages.setMonarchTokensProvider.mock.calls[0]?.[1] as Monaco.languages.IMonarchLanguage;
    expect(language.tokenizer.root).toEqual(expect.arrayContaining([
      expect.arrayContaining([expect.any(RegExp), 'variable.aiq']),
      expect.arrayContaining([expect.any(RegExp), ['delimiter.aiq', 'type.aiq']]),
      expect.arrayContaining([expect.any(RegExp), { cases: { '@keywords': 'keyword.aiq', '@default': 'identifier.aiq' } }])
    ]));
    languages.getLanguages.mockReturnValue([{ id: 'archinsight-query' }]);
    registerQueryLanguage({ languages } as unknown as typeof Monaco);
    expect(languages.register).toHaveBeenCalledOnce();
  });
});
