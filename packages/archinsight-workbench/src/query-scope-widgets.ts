import type * as Monaco from 'monaco-editor';
import { queryVariableOccurrences } from '@insight/language';
import './query-scope-widgets.css';

export type QueryScopeVariable = 'tab' | 'context';
export type QueryScopeChoice = { readonly value: string; readonly label: string; readonly typeName?: string };
export type QueryScopeWidgetState = {
  readonly enabled: boolean;
  readonly tab?: string;
  readonly context?: string;
  readonly sources: readonly QueryScopeChoice[];
  readonly contexts: readonly QueryScopeChoice[];
};
export type QueryScopeWidgetPorts = {
  state(): QueryScopeWidgetState;
  select(variable: QueryScopeVariable, value: string): void;
};

/** Only the view decorations and the popup change; the text model is never edited. */
export function createQueryScopeWidgets(
  monaco: typeof Monaco,
  editor: Monaco.editor.IStandaloneCodeEditor,
  ports: QueryScopeWidgetPorts
): { refresh(): void; dispose(): void } {
  const decorations = editor.createDecorationsCollection();
  let popup: Monaco.editor.IContentWidget | undefined;
  let closeListeners: (() => void) | undefined;
  const close = (focus = false): void => {
    if (popup !== undefined) editor.removeContentWidget(popup);
    popup = undefined;
    closeListeners?.();
    closeListeners = undefined;
    if (focus) editor.focus();
  };

  const open = (variable: QueryScopeVariable, position: Monaco.IPosition): void => {
    close();
    const state = ports.state();
    if (!state.enabled) return;
    const choices = variable === 'tab' ? state.sources : state.contexts;
    const root = document.createElement('div');
    root.className = 'query-scope-picker';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', `Select query ${variable === 'tab' ? 'source' : 'context'}`);
    const filter = document.createElement('input');
    filter.type = 'search';
    filter.placeholder = variable === 'tab' ? 'Find a file' : 'Find a context';
    filter.setAttribute('aria-label', filter.placeholder);
    const list = document.createElement('div');
    list.className = 'query-scope-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', variable === 'tab' ? 'Source files' : 'Contexts');
    const renderOptions = (): void => {
      list.replaceChildren();
      const search = filter.value.toLocaleLowerCase();
      for (const choice of choices.filter((item) => `${item.label} ${item.typeName ?? ''}`.toLocaleLowerCase().includes(search))) {
        const option = document.createElement('button');
        option.type = 'button';
        const label = document.createElement('span');
        label.className = 'query-scope-option-label';
        label.textContent = choice.label;
        label.title = choice.label;
        option.append(label);
        if (choice.typeName !== undefined) {
          const type = document.createElement('span');
          type.className = 'query-scope-option-type';
          type.textContent = choice.typeName;
          type.title = choice.typeName;
          option.append(type);
          option.setAttribute('aria-label', `${choice.label}, ${choice.typeName}`);
        }
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(choice.value === state[variable]));
        option.addEventListener('click', () => {
          ports.select(variable, choice.value);
          close(true);
          refresh();
        });
        list.append(option);
      }
      if (list.childElementCount === 0) {
        const empty = document.createElement('div');
        empty.className = 'query-scope-empty';
        empty.textContent = 'No matching choices';
        list.append(empty);
      }
    };
    filter.addEventListener('input', renderOptions);
    renderOptions();
    root.append(filter, list);
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const options = [...list.querySelectorAll('button')];
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        options[(index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length]?.focus();
      }
      if (event.key === 'Enter' && event.target === filter) {
        event.preventDefault();
        list.querySelector('button')?.click();
      }
    });
    popup = {
      getId: () => 'archinsight-query-scope',
      getDomNode: () => root,
      getPosition: () => ({ position, preference: [monaco.editor.ContentWidgetPositionPreference.BELOW, monaco.editor.ContentWidgetPositionPreference.ABOVE] }),
      allowEditorOverflow: true,
      suppressMouseDown: false
    };
    editor.addContentWidget(popup);
    const outside = (event: PointerEvent): void => { if (!root.contains(event.target as Node)) close(); };
    const focusOut = (event: FocusEvent): void => { if (event.relatedTarget instanceof Node && !root.contains(event.relatedTarget)) close(); };
    document.addEventListener('pointerdown', outside);
    root.addEventListener('focusout', focusOut);
    closeListeners = () => { document.removeEventListener('pointerdown', outside); root.removeEventListener('focusout', focusOut); };
    filter.focus();
  };

  const refresh = (): void => {
    close();
    const state = ports.state();
    const model = editor.getModel();
    if (!state.enabled || model === null) { decorations.clear(); return; }
    decorations.set(queryVariableOccurrences(model.getValue()).flatMap((occurrence) => {
      if (occurrence.name !== 'tab' && occurrence.name !== 'context') return [];
      const variable = occurrence.name;
      const position = model.getPositionAt(occurrence.endOffset);
      const label = state[variable] ?? (variable === 'tab' ? 'Select file' : 'Select context');
      return [{
        range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
        options: {
          description: 'Query execution scope',
          // Injected text is anchored at an empty range immediately after the
          // variable. Monaco omits such decorations unless this is explicit.
          showIfCollapsed: true,
          after: {
            content: ` [${label} ▾]`,
            inlineClassName: 'query-scope-chip',
            cursorStops: monaco.editor.InjectedTextCursorStops.None
          },
          hoverMessage: { value: 'Choose query scope (Ctrl/Cmd+Alt+Enter at the variable)' }
        }
      }];
    }));
  };

  const subscriptions = [
    editor.onDidChangeModel(refresh),
    editor.onDidChangeModelContent(refresh),
    editor.onMouseDown((event) => {
      if (event.target.type !== monaco.editor.MouseTargetType.CONTENT_TEXT) return;
      if (!event.target.element?.closest('.query-scope-chip') || event.target.position === null) return;
      const model = editor.getModel();
      if (model === null) return;
      const offset = model.getOffsetAt(event.target.position);
      const occurrence = queryVariableOccurrences(model.getValue()).find((item) => item.endOffset === offset);
      if (occurrence?.name === 'tab' || occurrence?.name === 'context') {
        event.event.preventDefault();
        open(occurrence.name, event.target.position);
      }
    }),
    editor.addAction({
      id: 'archinsight.chooseQueryScope', label: 'Choose query source or context',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.Enter],
      run() {
        const model = editor.getModel();
        const position = editor.getPosition();
        if (model === null || position === null || !ports.state().enabled) return;
        const offset = model.getOffsetAt(position);
        const occurrences = queryVariableOccurrences(model.getValue()).filter((item) => item.name === 'tab' || item.name === 'context');
        const occurrence = occurrences.find((item) => item.startOffset <= offset && item.endOffset >= offset) ?? occurrences[0];
        if (occurrence !== undefined) open(occurrence.name as QueryScopeVariable, model.getPositionAt(occurrence.endOffset));
      }
    })
  ];
  refresh();
  return { refresh, dispose() { close(); decorations.clear(); subscriptions.forEach((item) => item.dispose()); } };
}
