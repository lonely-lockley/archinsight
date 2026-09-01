<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
  import type { BuiltinDiagramView } from '@insight/language';

  type DiagramView = BuiltinDiagramView;

  type IncomingMessage = {
    command: 'state';
    view?: DiagramView;
    query?: string;
    readOnly?: boolean;
    focusQuery?: boolean;
  } | {
    command: 'clipboardText';
    requestId: number;
    text: string;
  };

  type VscodeApi = {
    postMessage(message: unknown): void;
  };

  declare const acquireVsCodeApi: () => VscodeApi;

  const vscode = acquireVsCodeApi();
  const darkTheme = 'archinsight-query-vscode-dark';
  const lightTheme = 'archinsight-query-vscode-light';

  let monaco: typeof Monaco | undefined;
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  let model: Monaco.editor.ITextModel | undefined;
  let editorHost: HTMLDivElement;
  let currentView: DiagramView = 'c1';
  let query = '';
  let readOnly = true;
  let suppressChange = false;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  let themeObserver: MutationObserver | undefined;
  let clipboardRequestId = 0;
  const pendingClipboardRequests = new Set<number>();

  onMount(() => {
    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleClipboardKeydown, true);
    void setupEditor();
    vscode.postMessage({ command: 'ready' });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
    window.removeEventListener('keydown', handleClipboardKeydown, true);
    if (renderTimer !== undefined) {
      clearTimeout(renderTimer);
    }
    pendingClipboardRequests.clear();
    themeObserver?.disconnect();
    editor?.dispose();
    model?.dispose();
  });

  async function setupEditor(): Promise<void> {
    monaco = await import('monaco-editor/esm/vs/editor/editor.api');
    registerQueryLanguage(monaco);
    defineThemes(monaco);
    observeThemeChanges(monaco);
    await tick();
    model = monaco.editor.createModel(query, 'archinsight-query');
    editor = monaco.editor.create(editorHost, {
      model,
      theme: editorTheme(),
      automaticLayout: true,
      fontSize: 12,
      lineNumbers: 'off',
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      renderLineHighlight: 'none',
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      readOnly,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8
      }
    });
    model.onDidChangeContent(() => {
      if (suppressChange || model === undefined) {
        return;
      }
      query = model.getValue();
      scheduleRender();
    });
  }

  function handleMessage(event: MessageEvent<IncomingMessage>): void {
    const message = event.data;
    if (message.command === 'clipboardText') {
      pasteClipboardText(message.requestId, message.text);
      return;
    }
    if (message.command !== 'state') {
      return;
    }
    currentView = message.view ?? currentView;
    query = message.query ?? query;
    readOnly = message.readOnly ?? readOnly;
    setModelValue(query);
    editor?.updateOptions({ readOnly });
    if (message.focusQuery === true && !readOnly) {
      editor?.focus();
    }
  }

  function setModelValue(value: string): void {
    if (model === undefined || model.getValue() === value) {
      return;
    }
    suppressChange = true;
    model.setValue(value);
    suppressChange = false;
  }

  function scheduleRender(): void {
    if (readOnly) {
      return;
    }
    if (renderTimer !== undefined) {
      clearTimeout(renderTimer);
    }
    renderTimer = setTimeout(postRender, 350);
  }

  function postRender(): void {
    if (readOnly) {
      return;
    }
    if (renderTimer !== undefined) {
      clearTimeout(renderTimer);
      renderTimer = undefined;
    }
    vscode.postMessage({ command: 'render', view: currentView, query });
  }

  function handleClipboardKeydown(event: KeyboardEvent): void {
    if (editor === undefined || !editor.hasTextFocus()) {
      return;
    }
    if (isCopyShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      copySelection();
      return;
    }
    if (readOnly) {
      return;
    }
    if (isCutShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      cutSelection();
      return;
    }
    if (!isPasteShortcut(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const requestId = ++clipboardRequestId;
    pendingClipboardRequests.add(requestId);
    vscode.postMessage({ command: 'clipboardRead', requestId });
  }

  function isPasteShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLocaleLowerCase();
    return ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'v')
      || (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'insert');
  }

  function isCopyShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLocaleLowerCase();
    return ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'c')
      || (event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && key === 'insert');
  }

  function isCutShortcut(event: KeyboardEvent): boolean {
    const key = event.key.toLocaleLowerCase();
    return ((event.metaKey || event.ctrlKey) && !event.altKey && key === 'x')
      || (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'delete');
  }

  function copySelection(): void {
    const text = selectedTextForClipboard();
    if (text.length > 0) {
      vscode.postMessage({ command: 'clipboardWrite', text });
    }
  }

  function cutSelection(): void {
    if (editor === undefined || model === undefined || monaco === undefined) {
      return;
    }
    const ranges = selectedRangesForClipboard();
    if (ranges.length === 0) {
      return;
    }
    const text = textForRanges(ranges);
    if (text.length === 0) {
      return;
    }
    vscode.postMessage({ command: 'clipboardWrite', text });
    editor.pushUndoStop();
    editor.executeEdits('keyboard', ranges.map((range) => ({ range, text: '', forceMoveMarkers: true })));
    editor.pushUndoStop();
  }

  function selectedTextForClipboard(): string {
    if (model === undefined) {
      return '';
    }
    return textForRanges(selectedRangesForClipboard());
  }

  function selectedRangesForClipboard(): Monaco.Range[] {
    if (editor === undefined || model === undefined || monaco === undefined) {
      return [];
    }
    const selections = editor.getSelections();
    if (selections === null || selections.length === 0) {
      return [];
    }
    return selections.map((selection) => selection.isEmpty()
      ? currentLineCutRange(selection.positionLineNumber)
      : selection);
  }

  function textForRanges(ranges: Monaco.Range[]): string {
    if (model === undefined) {
      return '';
    }
    return ranges.map((range) => model.getValueInRange(range)).join(model.getEOL());
  }

  function currentLineCutRange(lineNumber: number): Monaco.Range {
    if (model === undefined || monaco === undefined) {
      throw new Error('Monaco editor is not initialized');
    }
    if (lineNumber < model.getLineCount()) {
      return new monaco.Range(lineNumber, 1, lineNumber + 1, 1);
    }
    return new monaco.Range(lineNumber, 1, lineNumber, model.getLineMaxColumn(lineNumber));
  }

  function pasteClipboardText(requestId: number, text: string): void {
    if (!pendingClipboardRequests.delete(requestId) || editor === undefined || text.length === 0) {
      return;
    }
    editor.focus();
    editor.trigger('keyboard', 'paste', {
      text,
      pasteOnNewLine: false,
      multicursorText: null,
      mode: null
    });
  }

  function registerQueryLanguage(monacoInstance: typeof Monaco): void {
    if (!monacoInstance.languages.getLanguages().some((language) => language.id === 'archinsight-query')) {
      monacoInstance.languages.register({ id: 'archinsight-query' });
    }
    monacoInstance.languages.setMonarchTokensProvider('archinsight-query', {
      ignoreCase: true,
      keywords: [
        'MATCH',
        'OPTIONAL',
        'WHERE',
        'RETURN',
        'GROUP',
        'BY',
        'AND',
        'OR',
        'NOT',
        'CONTAINS',
        'TRUE',
        'FALSE',
        'NULL',
        'AS'
      ],
      tokenizer: {
        root: [
          [/--.*$/, 'comment'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/'([^'\\]|\\.)*$/, 'string.invalid'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/'([^'\\]|\\.)*'/, 'string'],
          [/\$[A-Za-z_][\w]*/, 'variable.predefined'],
          [/:[A-Za-z_][\w]*/, 'type.identifier'],
          [/[A-Za-z_][\w]*/, { cases: { '@keywords': 'keyword', '@default': 'identifier' } }],
          [/\d+/, 'number'],
          [/[{}()[\],.;]/, 'delimiter'],
          [/[-=<>!]+/, 'operator'],
          [/\s+/, 'white']
        ]
      }
    });
  }

  function observeThemeChanges(monacoInstance: typeof Monaco): void {
    themeObserver?.disconnect();
    themeObserver = new MutationObserver(() => {
      defineThemes(monacoInstance);
      monacoInstance.editor.setTheme(editorTheme());
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function defineThemes(monacoInstance: typeof Monaco): void {
    const styles = getComputedStyle(document.documentElement);
    const background = cssColor(styles, '--vscode-input-background', cssColor(styles, '--vscode-editor-background', '#1f1f1f'));
    const foreground = cssColor(styles, '--vscode-input-foreground', cssColor(styles, '--vscode-editor-foreground', '#e6e6e6'));
    monacoInstance.editor.defineTheme(darkTheme, {
      base: 'vs-dark',
      inherit: true,
      rules: queryTokenRules('dark'),
      colors: {
        'editor.background': background,
        'editor.foreground': foreground,
        'editor.selectionBackground': '#4c2889'
      }
    });
    monacoInstance.editor.defineTheme(lightTheme, {
      base: 'vs',
      inherit: true,
      rules: queryTokenRules('light'),
      colors: {
        'editor.background': background,
        'editor.foreground': foreground,
        'editor.selectionBackground': '#c8c8fa'
      }
    });
  }

  function editorTheme(): string {
    return document.body.classList.contains('vscode-light') ? lightTheme : darkTheme;
  }

  function cssColor(styles: CSSStyleDeclaration, property: string, fallback: string): string {
    const value = styles.getPropertyValue(property).trim();
    return value.length === 0 ? fallback : value;
  }

  function queryTokenRules(theme: 'dark' | 'light'): Monaco.editor.ITokenThemeRule[] {
    if (theme === 'light') {
      return [
        { token: 'comment', foreground: '6a737d' },
        { token: 'string', foreground: '032f62' },
        { token: 'variable.predefined', foreground: 'e36209' },
        { token: 'type.identifier', foreground: '6f42c1' },
        { token: 'keyword', foreground: 'd73a49' },
        { token: 'identifier', foreground: '24292e' },
        { token: 'number', foreground: '005cc5' },
        { token: 'operator', foreground: '24292e' },
        { token: 'delimiter', foreground: '24292e' }
      ];
    }
    return [
      { token: 'comment', foreground: '959da5' },
      { token: 'string', foreground: '79b8ff' },
      { token: 'variable.predefined', foreground: 'fb8532' },
      { token: 'type.identifier', foreground: 'b392f0' },
      { token: 'keyword', foreground: 'ea4a5a' },
      { token: 'identifier', foreground: 'f6f8fa' },
      { token: 'number', foreground: 'c8e1ff' },
      { token: 'operator', foreground: 'f6f8fa' },
      { token: 'delimiter', foreground: 'f6f8fa' }
    ];
  }
</script>

<main class="controls">
  <section class:read-only={readOnly} class="query-frame">
    <div bind:this={editorHost} class="query-editor"></div>
  </section>
</main>

<style>
  .controls {
    display: grid;
    grid-template-rows: minmax(86px, 1fr);
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 10px 12px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
  }

  .query-frame {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--vscode-input-background);
  }

  .query-frame:focus-within {
    border-color: var(--vscode-focusBorder);
  }

  .query-editor {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
</style>
