<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
  import type { CompletionKind } from '@insight/language';
  import WorkspaceEditor from '../../../archinsight-web/src/lib/WorkspaceEditor.svelte';
  import {
    createInsightSemanticTokensProvider,
    createInsightTokenVocabulary,
    createInsightTokensProvider,
    refreshInsightTokenVocabulary,
    type InsightSemanticTokensProvider,
    type InsightTokenVocabulary
  } from '../../../archinsight-web/src/lib/insight-monaco-language';
  import {
    defaultDiagramMode,
    defaultQuery,
    diagramModeForQuery,
    queryForDiagramMode
  } from '../../../archinsight-web/src/lib/diagram-query-presets';
  import type { DiagramMode, EditorViewMode, MessageView, SourceLocation } from '../../../archinsight-web/src/lib/workspace-types';
  import VscodeDownloadActions from './VscodeDownloadActions.svelte';

  type DiagramView = 'c1' | 'c2' | 'c3' | 'c4' | 'deployment' | 'deployment-system' | 'deployment-container' | 'no-filter';

  type CompletionItem = {
    label: string;
    insertText?: string;
    kind: CompletionKind;
    imported?: boolean;
  };

  type CompletionResponse = {
    items: CompletionItem[];
    replacementStartOffset: number;
    replacementEndOffset: number;
  };

  type IncomingMessage =
    | {
      command: 'source';
      source: string;
      sourceName: string;
      fileName: string;
      view: DiagramView;
      query: string;
      environment?: string;
      diagnostics?: Diagnostic[];
      symbols?: unknown;
      readOnly?: boolean;
    }
    | { command: 'query'; view: DiagramView; query: string; environment?: string }
    | { command: 'preview'; state: PreviewState }
    | { command: 'diagnostics'; diagnostics: Diagnostic[] }
    | { command: 'completionResult'; requestId: number; items: CompletionItem[]; replacementStartOffset?: number; replacementEndOffset?: number }
    | { command: 'clipboardText'; requestId: number; text: string }
    | { command: 'exportPng'; svg: string }
    | { command: 'reveal'; line: number; column: number };

  type Diagnostic = {
    sourceName: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    level?: string;
    code?: string;
    message: string;
  };

  type PreviewState = {
    view: DiagramView;
    query: string;
    environment?: string;
    sourceName: string;
    fileName: string;
    source: string;
    svg?: string;
    dot?: string;
    error?: string;
  };

  type VscodeApi = {
    postMessage(message: unknown): void;
  };

  declare const acquireVsCodeApi: () => VscodeApi;

  const vscode = acquireVsCodeApi();
  const defaultViewMode: EditorViewMode = 'split';
  const minDiagramScale = 0.2;
  const maxDiagramScale = 3;
  const darkEditorTheme = 'insight-vscode-dark';
  const lightEditorTheme = 'insight-vscode-light';

  let monaco: typeof Monaco | undefined;
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
  let model: Monaco.editor.ITextModel | undefined;
  let themeObserver: MutationObserver | undefined;
  let tokenVocabulary: InsightTokenVocabulary | undefined;
  let semanticTokensProvider: InsightSemanticTokensProvider | undefined;
  let editorHost: HTMLDivElement;
  let messagesPanel: HTMLElement;
  let suppressEditorChange = false;
  let sourceChangeTimer: ReturnType<typeof setTimeout> | undefined;
  let completionRequestId = 0;
  let clipboardRequestId = 0;
  let pendingReveal: { line: number; column: number } | undefined;
  const completionResolvers = new Map<number, (response: CompletionResponse) => void>();
  const pendingClipboardRequests = new Set<number>();

  let source = '';
  let sourceName = '';
  let fileName = '';
  let svg: string | undefined;
  let dot: string | undefined;
  let diagramMode: DiagramMode = defaultDiagramMode;
  let query = defaultQuery;
  let deploymentEnvironment: string | undefined;
  let queryVisible = false;
  let queryPanelHeight = 118;
  let viewMode: EditorViewMode = defaultViewMode;
  let diagramScale = 1;
  let diagramFit = false;
  let editorSplitRatio = 50;
  let diagnostics: Diagnostic[] = [];
  let renderError: string | undefined;
  let currentSymbols: unknown;
  let readOnly = false;

  $: messages = panelMessages(diagnostics, renderError);
  $: workAreaStyle = 'grid-template-rows: minmax(0, 1fr);';
  $: canDownloadDiagram = svg !== undefined && renderError === undefined;

  onMount(() => {
    window.addEventListener('message', handleMessage);
    window.addEventListener('keydown', handleClipboardKeydown, true);
    document.addEventListener('pointerdown', preventToolbarButtonFocus, true);
    void setupMonaco();
    vscode.postMessage({ command: 'ready' });
  });

  onDestroy(() => {
    window.removeEventListener('message', handleMessage);
    window.removeEventListener('keydown', handleClipboardKeydown, true);
    document.removeEventListener('pointerdown', preventToolbarButtonFocus, true);
    if (sourceChangeTimer !== undefined) {
      clearTimeout(sourceChangeTimer);
    }
    for (const resolve of completionResolvers.values()) {
      resolve({ items: [], replacementStartOffset: 0, replacementEndOffset: 0 });
    }
    completionResolvers.clear();
    pendingClipboardRequests.clear();
    themeObserver?.disconnect();
    editor?.dispose();
    model?.dispose();
  });

  function preventToolbarButtonFocus(event: PointerEvent): void {
    if (!(event.target instanceof Element)) {
      return;
    }
    if (event.target.closest('.toolbar button') !== null) {
      event.preventDefault();
    }
  }

  async function setupMonaco(): Promise<void> {
    monaco = await import('monaco-editor/esm/vs/editor/editor.api');
    tokenVocabulary = createInsightTokenVocabulary({ schemaVersion: 'webview-empty', types: [], constructors: [], operators: [], enums: [], presentations: [] });
    if (!monaco.languages.getLanguages().some((language) => language.id === 'insight')) {
      monaco.languages.register({ id: 'insight' });
    }
    monaco.languages.setTokensProvider('insight', createInsightTokensProvider(tokenVocabulary));
    semanticTokensProvider = createInsightSemanticTokensProvider(tokenVocabulary);
    monaco.languages.registerDocumentRangeSemanticTokensProvider('insight', semanticTokensProvider);
    defineEditorThemes(monaco);
    registerCompletionProvider(monaco);
    observeThemeChanges(monaco);
    await tick();
    model = monaco.editor.createModel(source, 'insight', monaco.Uri.parse(`insight://tab/${sourceName || 'active.ai'}`));
    editor = monaco.editor.create(editorHost, {
      model,
      theme: editorTheme(),
      automaticLayout: true,
      minimap: { enabled: true },
      autoIndent: 'full',
      suggest: {
        showWords: false
      },
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      tabSize: 4,
      insertSpaces: true,
      hover: { enabled: true },
      fixedOverflowWidgets: true,
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      renderValidationDecorations: 'on',
      'semanticHighlighting.enabled': true,
      scrollBeyondLastLine: false
    });
    editor.addCommand(monaco.KeyMod.WinCtrl | monaco.KeyCode.Space, () => {
      editor?.trigger('keyboard', 'editor.action.triggerSuggest', {});
    });
    editor.onDidChangeModelContent(() => {
      if (suppressEditorChange || readOnly || model === undefined) {
        return;
      }
      source = model.getValue();
      scheduleSourceChange(source);
    });
    editor.updateOptions({ readOnly });
    updateSymbols(currentSymbols);
    applyDiagnostics();
    flushPendingReveal();
  }

  function registerCompletionProvider(monacoInstance: typeof Monaco): void {
    monacoInstance.languages.registerCompletionItemProvider('insight', {
      triggerCharacters: ['@', '-', '~', '>', ':', '=', '.', ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')],
      async provideCompletionItems(currentModel, position) {
        const response = await requestCompletions(currentModel.getValue(), currentModel.getOffsetAt(position));
        const replacementStart = currentModel.getPositionAt(response.replacementStartOffset);
        const replacementEnd = currentModel.getPositionAt(response.replacementEndOffset);
        const range = {
          startLineNumber: replacementStart.lineNumber,
          endLineNumber: replacementEnd.lineNumber,
          startColumn: replacementStart.column,
          endColumn: replacementEnd.column
        };
        return {
          suggestions: response.items.map((item) => ({
            label: item.label,
            insertText: item.insertText ?? item.label,
            kind: completionItemKind(monacoInstance, item),
            range,
            sortText: `${completionSortBucket(item.kind)}:${item.label}`,
            detail: completionItemDetail(item)
          }))
        };
      }
    });
  }

  function requestCompletions(currentSource: string, cursorOffset: number): Promise<CompletionResponse> {
    const requestId = ++completionRequestId;
    const result = new Promise<CompletionResponse>((resolve) => completionResolvers.set(requestId, resolve));
    vscode.postMessage({
      command: 'complete',
      requestId,
      sourceName,
      source: currentSource,
      cursorOffset
    });
    return result;
  }

  function handleMessage(event: MessageEvent<IncomingMessage>): void {
    const message = event.data;
    if (message.command === 'source') {
      sourceName = message.sourceName;
      fileName = message.fileName;
      source = message.source;
      diagnostics = message.diagnostics ?? [];
      diagramMode = diagramModeFromView(message.view);
      query = message.query;
      deploymentEnvironment = message.environment;
      currentSymbols = message.symbols;
      readOnly = message.readOnly ?? false;
      updateSymbols(currentSymbols);
      editor?.updateOptions({ readOnly });
      applySource(source);
      applyDiagnostics();
      return;
    }
    if (message.command === 'query') {
      diagramMode = diagramModeFromView(message.view);
      query = message.query;
      deploymentEnvironment = message.environment;
      return;
    }
    if (message.command === 'preview') {
      sourceName = message.state.sourceName;
      fileName = message.state.fileName;
      diagramMode = diagramModeFromView(message.state.view);
      query = message.state.query;
      deploymentEnvironment = message.state.environment;
      svg = message.state.error === undefined ? message.state.svg : undefined;
      dot = message.state.dot;
      renderError = message.state.error;
      return;
    }
    if (message.command === 'diagnostics') {
      diagnostics = message.diagnostics;
      updateSymbols(currentSymbols);
      applyDiagnostics();
      return;
    }
    if (message.command === 'completionResult') {
      completionResolvers.get(message.requestId)?.({
        items: message.items,
        replacementStartOffset: message.replacementStartOffset ?? 0,
        replacementEndOffset: message.replacementEndOffset ?? 0
      });
      completionResolvers.delete(message.requestId);
      return;
    }
    if (message.command === 'clipboardText') {
      pasteClipboardText(message.requestId, message.text);
      return;
    }
    if (message.command === 'exportPng') {
      void exportPng(message.svg);
      return;
    }
    if (message.command === 'reveal') {
      revealPosition(message.line, message.column);
    }
  }

  function applySource(value: string): void {
    if (model === undefined || model.getValue() === value) {
      return;
    }
    suppressEditorChange = true;
    model.setValue(value);
    suppressEditorChange = false;
  }

  function revealPosition(line: number, column: number): void {
    pendingReveal = { line, column };
    flushPendingReveal();
  }

  function flushPendingReveal(): void {
    if (editor === undefined || model === undefined || pendingReveal === undefined) {
      return;
    }
    const position = {
      lineNumber: Math.max(1, Math.min(pendingReveal.line, model.getLineCount())),
      column: Math.max(1, pendingReveal.column)
    };
    pendingReveal = undefined;
    editor.setPosition(position);
    editor.revealPositionInCenterIfOutsideViewport(position);
    editor.focus();
  }

  function updateSymbols(symbols: unknown): void {
    if (tokenVocabulary === undefined || symbols === undefined) {
      return;
    }
    refreshInsightTokenVocabulary(tokenVocabulary, symbols as Parameters<typeof refreshInsightTokenVocabulary>[1], [source]);
    if (monaco !== undefined && model !== undefined) {
      monaco.editor.setModelLanguage(model, 'insight');
      semanticTokensProvider?.refresh();
      editor?.render(true);
    }
  }

  function applyDiagnostics(): void {
    if (monaco === undefined || model === undefined) {
      return;
    }
    monaco.editor.setModelMarkers(
      model,
      'archinsight',
      diagnostics.filter((diagnostic) => diagnostic.sourceName === sourceName).map((diagnostic) => ({
        message: diagnostic.message,
        severity: markerSeverity(diagnostic),
        startLineNumber: diagnostic.line ?? 1,
        startColumn: diagnostic.column ?? 1,
        endLineNumber: diagnostic.endLine ?? diagnostic.line ?? 1,
        endColumn: diagnostic.endColumn ?? Math.max((diagnostic.column ?? 1) + 1, 2),
        code: diagnostic.code
      }))
    );
  }

  function markerSeverity(diagnostic: Diagnostic): Monaco.MarkerSeverity {
    if (monaco === undefined) {
      return 8 as Monaco.MarkerSeverity;
    }
    const level = diagnosticLevel(diagnostic);
    if (level === 'ERROR') {
      return monaco.MarkerSeverity.Error;
    }
    if (level === 'WARNING') {
      return monaco.MarkerSeverity.Warning;
    }
    return monaco.MarkerSeverity.Info;
  }

  function diagnosticLevel(diagnostic: Diagnostic): MessageView['level'] {
    if (diagnostic.level === 'WARNING') {
      return 'WARNING';
    }
    if (diagnostic.level === 'NOTE') {
      return 'NOTE';
    }
    return 'ERROR';
  }

  function hasErrors(items: readonly Diagnostic[]): boolean {
    return items.some((diagnostic) => diagnosticLevel(diagnostic) === 'ERROR');
  }

  function scheduleSourceChange(value: string): void {
    if (readOnly) {
      return;
    }
    if (sourceChangeTimer !== undefined) {
      clearTimeout(sourceChangeTimer);
    }
    sourceChangeTimer = setTimeout(() => {
      vscode.postMessage({ command: 'sourceChanged', source: value });
    }, 180);
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
    if (isCutShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      if (!readOnly) {
        cutSelection();
      }
      return;
    }
    if (!isPasteShortcut(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (readOnly) {
      return;
    }
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

  function selectDiagramMode(mode: DiagramMode): void {
    if (mode === 'deployment-container') {
      vscode.postMessage({ command: 'selectDeploymentEnvironment' });
      return;
    }
    diagramMode = mode;
    query = queryForDiagramMode(mode);
    postRender();
  }

  function updateQuery(value: string): void {
    query = value;
    diagramMode = diagramModeForQuery(value) ?? diagramMode;
    postRender();
  }

  function postRender(): void {
    vscode.postMessage({ command: 'render', view: viewFromDiagramMode(diagramMode), query });
  }

  function refresh(): void {
    vscode.postMessage({ command: 'refresh' });
  }

  function download(kind: 'source' | 'svg' | 'png' | 'dot'): void {
    vscode.postMessage({ command: 'download', kind });
  }

  function openDeclaration(declaration: SourceLocation): void {
    vscode.postMessage({ command: 'openDeclaration', declaration });
  }

  function toggleQuery(): void {
    vscode.postMessage({ command: 'editQuery', view: viewFromDiagramMode(diagramMode), query });
  }

  function zoomDiagram(step: number): void {
    diagramScale = clamp(diagramScale + step, minDiagramScale, maxDiagramScale);
    diagramFit = false;
  }

  function fitDiagram(): void {
    diagramFit = true;
  }

  function actualSize(): void {
    diagramScale = 1;
    diagramFit = false;
  }

  function panelMessages(currentDiagnostics: Diagnostic[], error: string | undefined): MessageView[] {
    const result = currentDiagnostics
      .filter((diagnostic) => diagnostic.sourceName === sourceName)
      .map((diagnostic, index) => ({
        id: `diagnostic-${index}-${diagnostic.code ?? ''}-${diagnostic.line ?? 0}-${diagnostic.column ?? 0}`,
        level: diagnosticLevel(diagnostic),
        source: diagnostic.sourceName,
        position: diagnostic.line === undefined ? undefined : `${diagnostic.line}:${diagnostic.column ?? 1}`,
        message: diagnostic.message
      }));
    if (error !== undefined) {
      result.push({
        id: 'render-error',
        level: 'ERROR',
        source: fileName,
        message: error
      });
    }
    return result;
  }

  function diagramModeFromView(view: DiagramView): DiagramMode {
    return view === 'no-filter' ? 'default' : view;
  }

  function viewFromDiagramMode(mode: DiagramMode): DiagramView {
    return mode === 'default' ? 'no-filter' : mode;
  }

  function editorTheme(): string {
    return document.body.classList.contains('vscode-light') ? lightEditorTheme : darkEditorTheme;
  }

  function observeThemeChanges(monacoInstance: typeof Monaco): void {
    themeObserver?.disconnect();
    themeObserver = new MutationObserver(() => {
      defineEditorThemes(monacoInstance);
      monacoInstance.editor.setTheme(editorTheme());
    });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function defineEditorThemes(monacoInstance: typeof Monaco): void {
    const styles = getComputedStyle(document.documentElement);
    const background = cssColor(styles, '--vscode-editor-background', '#1f1f1f');
    const foreground = cssColor(styles, '--vscode-editor-foreground', '#e6e6e6');
    monacoInstance.editor.defineTheme(darkEditorTheme, {
      base: 'vs-dark',
      inherit: true,
      rules: insightTokenRules('dark'),
      colors: {
        'editor.background': background,
        'editor.foreground': foreground,
        'editor.selectionBackground': '#4c2889'
      }
    });
    monacoInstance.editor.defineTheme(lightEditorTheme, {
      base: 'vs',
      inherit: true,
      rules: insightTokenRules('light'),
      colors: {
        'editor.background': background,
        'editor.foreground': foreground,
        'editor.selectionBackground': '#c8c8fa'
      }
    });
  }

  function cssColor(styles: CSSStyleDeclaration, property: string, fallback: string): string {
    const value = styles.getPropertyValue(property).trim();
    return value.length === 0 ? fallback : value;
  }

  function insightTokenRules(theme: 'dark' | 'light'): Monaco.editor.ITokenThemeRule[] {
    if (theme === 'light') {
      return [
        { token: 'comment', foreground: '6a737d' },
        { token: 'string', foreground: '032f62' },
        { token: 'entity.name', foreground: '6f42c1' },
        { token: 'entity.name.function.constructor.insight', foreground: '22863a' },
        { token: 'function', foreground: '22863a' },
        { token: 'keyword', foreground: 'd73a49' },
        { token: 'keyword.control.insight', foreground: '008b8b' },
        { token: 'keyword', foreground: '008b8b' },
        { token: 'keyword.declaration.insight', foreground: 'b05a00' },
        { token: 'keyword.declaration', foreground: 'b05a00' },
        { token: 'variable', foreground: 'e36209' },
        { token: 'variable.other', foreground: '24292e' },
        { token: 'property', foreground: '24292e' },
        { token: 'operator', foreground: '24292e' },
        { token: 'type', foreground: '6f42c1' },
        { token: 'annotation', foreground: 'b08800' },
        { token: 'constant.language.annotation', foreground: 'b08800' }
      ];
    }
    return [
      { token: 'comment', foreground: '959da5' },
      { token: 'string', foreground: '79b8ff' },
      { token: 'entity.name', foreground: 'b392f0' },
      { token: 'entity.name.function.constructor.insight', foreground: '7ee787' },
      { token: 'function', foreground: '7ee787' },
      { token: 'keyword', foreground: 'ea4a5a' },
      { token: 'keyword.control.insight', foreground: '39c5bb' },
      { token: 'keyword', foreground: '39c5bb' },
      { token: 'keyword.declaration.insight', foreground: 'd19a66' },
      { token: 'keyword.declaration', foreground: 'd19a66' },
      { token: 'variable', foreground: 'fb8532' },
      { token: 'variable.other', foreground: 'f6f8fa' },
      { token: 'property', foreground: 'f6f8fa' },
      { token: 'operator', foreground: 'f6f8fa' },
      { token: 'type', foreground: 'b392f0' },
      { token: 'annotation', foreground: 'f2cc60' },
      { token: 'constant.language.annotation', foreground: 'f2cc60' }
    ];
  }

  function completionItemKind(monacoInstance: typeof Monaco, item: CompletionItem): Monaco.languages.CompletionItemKind {
    switch (item.kind) {
      case 'KEYWORD':
        return monacoInstance.languages.CompletionItemKind.Keyword;
      case 'TYPE':
        return monacoInstance.languages.CompletionItemKind.Class;
      case 'CONSTRUCTOR':
        return monacoInstance.languages.CompletionItemKind.Constructor;
      case 'OPERATOR':
        return monacoInstance.languages.CompletionItemKind.Operator;
      case 'ATTRIBUTE':
        return monacoInstance.languages.CompletionItemKind.Property;
      case 'IDENTIFIER':
        return item.imported === true
          ? monacoInstance.languages.CompletionItemKind.Reference
          : monacoInstance.languages.CompletionItemKind.Variable;
      case 'ENUM_VALUE':
        return monacoInstance.languages.CompletionItemKind.EnumMember;
      case 'ANNOTATION':
        return monacoInstance.languages.CompletionItemKind.Function;
      case 'NEWLINE':
        return monacoInstance.languages.CompletionItemKind.Snippet;
    }
  }

  function completionItemDetail(item: CompletionItem): string {
    return item.kind === 'IDENTIFIER' && item.imported === true ? 'imported identifier' : item.kind;
  }

  function completionSortBucket(kind: CompletionKind): string {
    switch (kind) {
      case 'KEYWORD':
        return '1';
      case 'CONSTRUCTOR':
        return '2';
      case 'OPERATOR':
        return '3';
      case 'ATTRIBUTE':
        return '4';
      case 'IDENTIFIER':
        return '5';
      case 'ENUM_VALUE':
        return '6';
      case 'TYPE':
        return '7';
      case 'ANNOTATION':
        return '8';
      case 'NEWLINE':
        return '8';
    }
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  async function exportPng(currentSvg: string): Promise<void> {
    const image = new Image();
    const url = URL.createObjectURL(new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' }));
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || 1;
    canvas.height = image.naturalHeight || 1;
    const context = canvas.getContext('2d');
    context?.drawImage(image, 0, 0);
    URL.revokeObjectURL(url);
    vscode.postMessage({ command: 'png', dataUrl: canvas.toDataURL('image/png') });
  }
</script>

<WorkspaceEditor
  active={true}
  {svg}
  {diagramMode}
  {deploymentEnvironment}
  {query}
  {queryVisible}
  {queryPanelHeight}
  {viewMode}
  {diagramScale}
  {diagramFit}
  {editorSplitRatio}
  {messages}
  messagesVisible={false}
  showMessagesPanel={false}
  {workAreaStyle}
  bind:editorHost
  bind:messagesPanel
  refreshDisabled={false}
  onSelectDiagramMode={selectDiagramMode}
  onToggleQuery={toggleQuery}
  onQueryChange={updateQuery}
  onQueryPanelHeightChange={(height) => queryPanelHeight = height}
  onZoomIn={() => zoomDiagram(0.06)}
  onZoomOut={() => zoomDiagram(-0.06)}
  onFitDiagram={fitDiagram}
  onActualSize={actualSize}
  onSelectViewMode={(mode) => viewMode = mode}
  onRefresh={refresh}
  onEditorSplitRatioChange={(ratio) => editorSplitRatio = ratio}
  onDiagramVisibleScaleChange={(scale) => diagramScale = scale}
  onOpenDeclaration={openDeclaration}
  onBeginMessagesResize={() => {}}
>
  <VscodeDownloadActions
    slot="leading-actions"
    onDownloadSource={() => download('source')}
    onDownloadSvg={() => download('svg')}
    onDownloadPng={() => download('png')}
    onDownloadDot={() => download('dot')}
    canDownloadSvg={canDownloadDiagram}
    canDownloadPng={canDownloadDiagram}
    canDownloadDot={dot !== undefined && renderError === undefined}
  />
</WorkspaceEditor>
