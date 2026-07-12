<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import 'monaco-editor/esm/vs/editor/editor.all.js';
  import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
  import 'monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css';
  import type * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';
  import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
  import {
    CompletionEngine,
    buildLanguageSnapshotFromSources,
    coreLanguageSnapshot,
    coreSource,
    coreSources,
    createGeneratedInsightSyntaxProvider,
    mergeLanguageSnapshots,
    type LanguageSnapshot,
    type CompletionKind
  } from '@insight/language';
  import AuthMenu from '$lib/AuthMenu.svelte';
  import ProjectNavigationPanel from '$lib/ProjectNavigationPanel.svelte';
  import {
    defaultDiagramMode,
    defaultQuery,
    diagramModeForQuery,
    normalizeDiagramMode,
    queryForDiagramMode
  } from '$lib/QueryEditorPanel.svelte';
  import WorkspaceEditor from '$lib/WorkspaceEditor.svelte';
  import WorkspaceToolbar from '$lib/WorkspaceToolbar.svelte';
  import { renderDotInBrowser, terminateBrowserGraphvizWorker } from '$lib/graphviz-renderer';
  import { emptyWorkspaceStrategy, type EmptyWorkspaceAction } from '$lib/empty-workspace-strategy';
  import {
    createInsightSemanticTokensProvider,
    createInsightTokenVocabulary,
    createInsightTokensProvider,
    refreshInsightTokenVocabulary,
    type InsightSemanticTokensProvider,
    type InsightTokenVocabulary
  } from '$lib/insight-monaco-language';
  import LanguageWorker from '$lib/language.worker?worker';
  import { defineInsightThemes, insightDarkTheme } from '$lib/monaco-themes';
  import {
    completionSnapshotFromProjectStructure,
    emptyWorkspaceCompletionSnapshot,
    hasErrorDiagnostics,
    visibleIdentifiersForSource,
    type WorkspaceCompletionSnapshot
  } from '$lib/workspace-completion-snapshot';
  import {
    createFolder,
    deleteFile,
    deleteFolder,
    fetchFile,
    fetchCurrentUser,
    fetchProjects,
    fetchProjectStructure,
    fetchProjectSymbols,
    fetchTree,
    linkProject,
    logoutCurrentUser,
    renameFile,
    renameFolder,
    renderProjectSvg,
    routePath,
    saveFile,
    AuthRequiredError,
    type AuthUserResponse,
    type Diagnostic,
    type DotRender,
    type FileTreeNode,
    type ProjectStructure
  } from '$lib/api';
  import {
    clearLocalWorkspaceStorage,
    hasLocalSource,
    readProjectRegistry,
    readLocalSource,
    readWorkspace,
    removeLocalSource,
    type ProjectRegistryState,
    writeLocalSource,
    writeProjectRegistry,
    writeWorkspace,
    type WorkspaceTabState,
    type WorkspaceUiState
  } from '$lib/storage';
  import type { DiagramMode, EditorViewMode, MessageView, ProjectUiState, SourceLocation, TreeNode, WorkspaceTab } from '$lib/workspace-types';

  const defaultViewMode: EditorViewMode = 'split';
  const defaultDiagramScale = 1;
  const defaultEditorSplitRatio = 50;
  const defaultQueryPanelHeight = 118;
  const minSidebarWidth = 150;
  const defaultSidebarWidth = 300;
  const collapsedSidebarWidth = 44;
  const minMessagesHeight = 150;
  const defaultMessagesHeight = 180;
  const maxMessages = 250;
  const minDiagramScale = 0.25;
  const maxDiagramScale = 3;
  const minEditorSplitRatio = 20;
  const maxEditorSplitRatio = 80;
  const defaultNewFileName = 'untitled';
  const coreSourceIdentity = coreSources.some((source) => source.sourceName === 'core.ai') ? 'core.ai' : coreSources[0]?.sourceName ?? 'core.ai';
  const coreSourceByName = new Map(coreSources.map((source) => [source.sourceName, source.source]));
  const coreTabId = readonlyCoreTabId(coreSourceIdentity);
  const emptySymbols: LanguageSnapshot = {
    schemaVersion: 'empty',
    types: [],
    constructors: [],
    operators: [],
    enums: []
  };

  type FileDialogMode = 'save' | 'new' | 'rename';
  type FileDialogTarget = 'file' | 'folder';

  type FileDialogState = {
    mode: FileDialogMode;
    target: FileDialogTarget;
    title: string;
    directory: string;
    fileName: string;
    sourcePath?: string;
    tabId?: string;
    content?: string;
    error?: string;
  };

  type DeleteDialogState = {
    path: string;
    target: FileDialogTarget;
    error?: string;
  };

  type DiagramQueryState = Pick<WorkspaceTab, 'diagramMode' | 'query'>;

  function readonlyCoreTabId(sourceIdentity: string): string {
    return `__readonly__/${sourceIdentity}`;
  }

  let tree: TreeNode | undefined;
  let projectSymbols: LanguageSnapshot = emptySymbols;
  let projectStructure: ProjectStructure | undefined;
  let projectRegistry: ProjectRegistryState = { projects: [] };
  let activeProjectId: string | undefined;
  let workspaceCompletionSnapshot: WorkspaceCompletionSnapshot = emptyWorkspaceCompletionSnapshot;
  let workspaceCompletionSnapshotRevision = 0;
  let editorSymbols: LanguageSnapshot = coreLanguageSnapshot;
  let tabs: WorkspaceTab[] = [];
  let activeTabId: string | undefined;
  let editorHost: HTMLDivElement;
  let monaco: typeof Monaco;
  let editor: Monaco.editor.IStandaloneCodeEditor;
  let completionEngine: CompletionEngine;
  let tokenVocabulary: InsightTokenVocabulary;
  let semanticTokensProvider: InsightSemanticTokensProvider;
  let editorTabId: string | undefined;
  let editorModels = new Map<string, Monaco.editor.ITextModel>();
  let untitledCounter = 1;
  let suppressEditorChange = false;
  let debounceHandle: number | undefined;
  let linkSequence = 0;
  let syntaxSequence = 0;
  let liveSyntaxSequence = 0;
  let refreshDisabled = false;
  let refreshCooldownHandle: number | undefined;
  let languageWorker: Worker | undefined;
  let syntaxResolvers = new Map<number, (diagnostics: Diagnostic[]) => void>();
  let localDiagnostics: Record<string, Diagnostic[]> = {};
  let linkerDiagnostics: Record<string, Diagnostic[]> = {};
  let overlays: Record<string, string> = {};
  let projectUi: ProjectUiState = defaultProjectUi();
  let systemMessages: MessageView[] = [];
  let sidebarResizeStart: { pointerId: number; startX: number; width: number } | undefined;
  let messagesResizeStart: { pointerId: number; startY: number; height: number } | undefined;
  let messagesPanel: HTMLElement;
  let lastAutoScrolledMessagesSignature = '';
  let diagramVisibleScale = defaultDiagramScale;
  let diagramVisibleScaleTabId: string | undefined;
  let repositoryMenu: { node: TreeNode; x: number; y: number } | undefined;
  let fileDialog: FileDialogState | undefined;
  let deleteDialog: DeleteDialogState | undefined;
  let currentUser: AuthUserResponse = { authenticated: false };

  $: activeTab = tabs.find((tab) => tab.id === activeTabId);
  $: projectId = activeProjectId ?? '';
  $: emptyStrategy = emptyWorkspaceStrategy(projectRegistry.projects, activeProjectId);
  $: activeFilePath = activeTab?.filePath;
  $: activeDiagramMode = activeTab?.diagramMode ?? defaultDiagramMode;
  $: activeQuery = activeTab?.query ?? defaultQuery;
  $: activeQueryVisible = activeTab?.queryVisible ?? false;
  $: activeQueryPanelHeight = activeTab?.queryPanelHeight ?? defaultQueryPanelHeight;
  $: activeDiagramScale = activeTab?.diagramScale ?? defaultDiagramScale;
  $: activeDiagramFit = activeTab?.diagramFit ?? false;
  $: activeViewMode = activeTab?.viewMode ?? defaultViewMode;
  $: activeEditorSplitRatio = activeTab?.editorSplitRatio ?? defaultEditorSplitRatio;
  $: activeReadOnly = activeTab?.readOnly === true;
  $: errorSourceIdentities = diagnosticErrorSources(localDiagnostics, linkerDiagnostics);
  $: workspaceHasErrors = diagnosticsHaveErrors(localDiagnostics) || diagnosticsHaveErrors(linkerDiagnostics);
  $: canDownloadCurrentDiagram = activeTab !== undefined
    && activeTab.dot !== undefined
    && activeTab.svg.trim().length > 0
    && !workspaceHasErrors;
  $: canDownloadCurrentDot = activeTab?.dot !== undefined;
  $: completionContextIds = workspaceCompletionSnapshot.contextIds;
  $: if (diagramVisibleScaleTabId !== activeTabId) {
    diagramVisibleScaleTabId = activeTabId;
    diagramVisibleScale = activeDiagramScale;
  }
  $: panelMessages = systemMessages;
  $: sidebarVisible = projectUi.sidebarVisible;
  $: workspaceStyle = `grid-template-columns: ${sidebarVisible ? clamp(projectUi.sidebarWidth, minSidebarWidth, 720) : collapsedSidebarWidth}px minmax(0, 1fr);`;
  $: workAreaStyle = projectUi.messagesVisible
    ? `grid-template-rows: minmax(0, 1fr) 6px ${clamp(projectUi.messagesHeight, minMessagesHeight, 520)}px;`
    : 'grid-template-rows: minmax(0, 1fr) 0 0;';
  $: scrollMessagesToEnd(panelMessages, projectUi.messagesVisible);

  onMount(async () => {
    (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
      getWorker: () => new EditorWorker()
    };
    setupLanguageWorker();
    const userLoaded = await refreshCurrentUser();
    if (!userLoaded) {
      return;
    }
    if (!currentUser.authenticated) {
      window.location.href = loginRoute();
      return;
    }
    try {
      await setupMonaco();
      await loadProjects();
      if (activeProjectId !== undefined) {
        await loadProject();
      }
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      appendErrorMessage(`Startup error: ${errorMessage(error)}`);
    }
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('click', closeRepositoryMenu);
  });

  onDestroy(() => {
    if (refreshCooldownHandle !== undefined) {
      window.clearTimeout(refreshCooldownHandle);
    }
    window.removeEventListener('pointermove', resizeSidebar);
    window.removeEventListener('pointermove', resizeMessages);
    window.removeEventListener('keydown', handleGlobalKeydown);
    window.removeEventListener('click', closeRepositoryMenu);
    languageWorker?.terminate();
    terminateBrowserGraphvizWorker();
    for (const model of editorModels.values()) {
      model.dispose();
    }
  });

  function setupLanguageWorker(): void {
    languageWorker = new LanguageWorker();
    languageWorker.onmessage = (event: MessageEvent<{ requestId: number; diagnostics: Diagnostic[] }>) => {
      const resolver = syntaxResolvers.get(event.data.requestId);
      if (resolver === undefined) {
        return;
      }
      syntaxResolvers.delete(event.data.requestId);
      resolver(event.data.diagnostics);
    };
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveActiveTab();
    }
  }

  function closeRepositoryMenu(): void {
    repositoryMenu = undefined;
  }

  function handleEmptyWorkspaceAction(action: EmptyWorkspaceAction): void {
    switch (action.id) {
      case 'create-tab':
        void newFile();
        return;
      case 'create-project':
        appendInfoMessage('Project creation UI is not implemented yet');
        return;
      case 'manage-projects':
        appendInfoMessage('Project management UI is not implemented yet');
        return;
    }
  }

  async function refreshCurrentUser(): Promise<boolean> {
    try {
      currentUser = await fetchCurrentUser();
      return true;
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return false;
      }
      currentUser = { authenticated: false };
      appendErrorMessage(`Auth error: ${errorMessage(error)}`);
      return true;
    }
  }

  function login(): void {
    window.location.href = loginRoute();
  }

  function openSettings(): void {
    appendInfoMessage('Settings UI is not implemented yet');
  }

  async function logout(): Promise<void> {
    try {
      await logoutCurrentUser();
      clearLocalWorkspaceStorage();
      if (currentUser.logoutUrl !== undefined && currentUser.logoutUrl !== null && currentUser.logoutUrl.length > 0) {
        window.location.href = currentUser.logoutUrl;
        return;
      }
      currentUser = { authenticated: false };
      window.location.href = routePath('/login');
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      appendErrorMessage(`Logout failed: ${errorMessage(error)}`);
    }
  }

  function redirectIfAuthRequired(error: unknown): boolean {
    if (!(error instanceof AuthRequiredError)) {
      return false;
    }
    window.location.href = loginRoute();
    return true;
  }

  function loginRoute(): string {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `${routePath('/login')}?returnTo=${encodeURIComponent(currentPath)}`;
  }

  async function setupMonaco(): Promise<void> {
    monaco = await import('monaco-editor/esm/vs/editor/editor.api');
    completionEngine = new CompletionEngine(createGeneratedInsightSyntaxProvider());
    tokenVocabulary = createInsightTokenVocabulary(editorSymbols);
    monaco.languages.register({ id: 'insight' });
    monaco.languages.setTokensProvider('insight', createInsightTokensProvider(tokenVocabulary));
    semanticTokensProvider = createInsightSemanticTokensProvider(tokenVocabulary);
    monaco.languages.registerDocumentRangeSemanticTokensProvider('insight', semanticTokensProvider);
    defineInsightThemes(monaco);
    registerCompletionProvider();
    editor = monaco.editor.create(editorHost, {
      model: null,
      theme: insightDarkTheme,
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
    editor.onDidChangeModelContent(() => {
      if (suppressEditorChange || activeTabId === undefined) {
        return;
      }
      const content = editor.getValue();
      const tab = tabs.find((item) => item.id === activeTabId);
      if (tab === undefined || tab.readOnly === true) {
        return;
      }
      updateTab(tab.id, { content, local: true, dot: undefined });
      if (tab.filePath !== undefined) {
        overlays = { ...overlays, [tab.filePath]: content };
        writeLocalSource(projectId, tab.filePath, content);
      }
      scheduleLink();
      persistWorkspace();
      refreshEditorTokenVocabulary({ repaint: false });
      scheduleLiveSyntaxCheck([{ sourceIdentity: tab.sourceIdentity, content }]);
    });
  }

  function registerCompletionProvider(): void {
    monaco.languages.registerCompletionItemProvider('insight', {
      triggerCharacters: [
        '@',
        '-',
        '~',
        '>',
        ':',
        '=',
        '.',
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')
      ],
      provideCompletionItems(model, position) {
        const path = sourceIdentityForModel(model);
        const offset = model.getOffsetAt(position);
        const result = completionEngine.complete({
          sourceName: path,
          source: model.getValue(),
          cursorOffset: offset,
          snapshot: editorSymbols,
          indexedIdentifiers: visibleIdentifiersForSource(workspaceCompletionSnapshot, path),
          contextIds: completionContextIds
        });
        const replacementStart = model.getPositionAt(result.replacementStartOffset);
        const replacementEnd = model.getPositionAt(result.replacementEndOffset);
        const range = {
          startLineNumber: replacementStart.lineNumber,
          endLineNumber: replacementEnd.lineNumber,
          startColumn: replacementStart.column,
          endColumn: replacementEnd.column
        };
        return {
          suggestions: result.items.map((item) => ({
            label: item.label,
            kind: completionItemKind(item),
            insertText: item.insertText,
            range,
            detail: completionItemDetail(item)
          }))
        };
      }
    });
  }

  function sourceIdentityForModel(model: Monaco.editor.ITextModel): string {
    for (const [id, candidate] of editorModels) {
      if (candidate === model) {
        return tabs.find((tab) => tab.id === id)?.sourceIdentity ?? id;
      }
    }
    return model.uri.path.replace(/^\/+/, '');
  }

  function completionItemKind(item: { kind: CompletionKind; imported?: boolean }): Monaco.languages.CompletionItemKind {
    switch (item.kind) {
      case 'KEYWORD':
        return monaco.languages.CompletionItemKind.Keyword;
      case 'TYPE':
        return monaco.languages.CompletionItemKind.Class;
      case 'CONSTRUCTOR':
        return monaco.languages.CompletionItemKind.Constructor;
      case 'OPERATOR':
        return monaco.languages.CompletionItemKind.Operator;
      case 'ATTRIBUTE':
        return monaco.languages.CompletionItemKind.Property;
      case 'IDENTIFIER':
        return item.imported === true
          ? monaco.languages.CompletionItemKind.Reference
          : monaco.languages.CompletionItemKind.Variable;
      case 'ENUM_VALUE':
        return monaco.languages.CompletionItemKind.EnumMember;
      case 'ANNOTATION':
        return monaco.languages.CompletionItemKind.Function;
      case 'NEWLINE':
        return monaco.languages.CompletionItemKind.Snippet;
    }
  }

  function completionItemDetail(item: { kind: CompletionKind; imported?: boolean }): string {
    return item.kind === 'IDENTIFIER' && item.imported === true ? 'imported identifier' : item.kind;
  }

  async function loadProjects(): Promise<void> {
    const response = await fetchProjects();
    const projects = response.projects.map((project) => ({ id: project.id, name: project.name }));
    const stored = readProjectRegistry();
    const preferredActiveProjectId = stored.activeProjectId !== undefined
      && projects.some((project) => project.id === stored.activeProjectId)
      ? stored.activeProjectId
      : projects[0]?.id;
    projectRegistry = {
      activeProjectId: preferredActiveProjectId,
      projects
    };
    activeProjectId = preferredActiveProjectId;
    writeProjectRegistry(projectRegistry);
    if (activeProjectId === undefined) {
      tree = undefined;
      projectSymbols = emptySymbols;
      projectStructure = undefined;
      tabs = [];
      activeTabId = undefined;
      localDiagnostics = {};
      linkerDiagnostics = {};
      overlays = {};
      refreshEditorSymbols();
    }
  }

  async function loadProject(): Promise<void> {
    if (activeProjectId === undefined) {
      return;
    }
    try {
      const [treeResponse, symbols, structure] = await Promise.all([
        fetchTree(projectId),
        fetchProjectSymbols(projectId),
        fetchProjectStructure(projectId)
      ]);
      tree = treeResponse.root;
      projectSymbols = symbols;
      acceptProjectStructureSnapshot(structure);
      refreshEditorSymbols();
      const workspace = readWorkspace(projectId);
      projectUi = normalizeProjectUi(workspace.ui, workspace.tabs);
      for (const tab of workspace.tabs) {
        if (tab.filePath !== undefined) {
          await openFile(tab.filePath, false, false, tab);
        } else {
          restoreLocalTab(tab);
        }
      }
      if (workspace.activeTab !== undefined && tabs.some((tab) => tab.id === workspace.activeTab)) {
        await activateTab(workspace.activeTab);
      } else if (tabs[0] !== undefined) {
        await activateTab(tabs[0].id);
      }
      scheduleLink();
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      appendErrorMessage(`Server error: ${errorMessage(error)}`);
    }
  }

  async function openFile(
    path: string,
    activate = true,
    render = true,
    restored?: WorkspaceTabState,
    queryState?: DiagramQueryState
  ): Promise<void> {
    const existing = tabs.find((tab) => tab.filePath === path);
    if (existing !== undefined) {
      applyInheritedQuery(existing.id, queryState);
      if (activate) {
        await activateTab(path);
      }
      return;
    }

    const localContent = readLocalSource(projectId, path);
    let content: string;
    try {
      content = localContent ?? (await fetchFile(projectId, path)).content;
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      appendErrorMessage(`Server error: ${errorMessage(error)}`);
      return;
    }
    if (hasLocalSource(projectId, path)) {
      overlays = { ...overlays, [path]: content };
    }
    ensureEditorModel(path, content);
    tabs = [
      ...tabs,
      {
        title: path.split('/').at(-1) ?? path,
        content,
        svg: emptySvg('Render is waiting for a valid model'),
        id: path,
        filePath: path,
        sourceIdentity: path,
        diagnostics: [],
        local: localContent !== undefined,
        ...tabToolbarState({ ...restored, ...queryState })
      }
    ];
    refreshEditorTokenVocabulary();
    persistWorkspace();
    if (activate) {
      await activateTab(path);
    }
    if (render) {
      scheduleLiveSyntaxCheck([{ sourceIdentity: path, content }]);
      scheduleLink();
    }
  }

  async function goToDeclaration(declaration: SourceLocation): Promise<void> {
    const queryState = currentDiagramQueryState();
    if (coreSourceByName.has(declaration.source)) {
      await openCoreSource(declaration.source, queryState);
    } else {
      await openFile(declaration.source, true, true, undefined, queryState);
    }
    await tick();
    revealEditorLocation(declaration);
  }

  async function openCoreSource(sourceIdentity = coreSourceIdentity, queryState?: DiagramQueryState): Promise<void> {
    const tabId = readonlyCoreTabId(sourceIdentity);
    const source = coreSourceByName.get(sourceIdentity) ?? coreSource;
    const existing = tabs.find((tab) => tab.id === tabId);
    if (existing !== undefined) {
      applyInheritedQuery(existing.id, queryState);
      await activateTab(existing.id);
      return;
    }
    ensureEditorModel(tabId, source);
    tabs = [
      ...tabs,
      {
        title: sourceIdentity,
        content: source,
        svg: emptySvg('Core framework source is read-only'),
        id: tabId,
        sourceIdentity,
        diagnostics: [],
        local: false,
        readOnly: true,
        projectSource: false,
        ...tabToolbarState(queryState)
      }
    ];
    refreshEditorTokenVocabulary();
    await activateTab(tabId);
  }

  function currentDiagramQueryState(): DiagramQueryState | undefined {
    if (activeTab === undefined) {
      return undefined;
    }
    return {
      diagramMode: activeDiagramMode,
      query: activeQuery
    };
  }

  function applyInheritedQuery(tabId: string, queryState: DiagramQueryState | undefined): void {
    if (queryState === undefined) {
      return;
    }
    const next = tabToolbarState(queryState);
    updateTab(tabId, {
      diagramMode: next.diagramMode,
      query: next.query,
      dot: undefined
    });
    persistWorkspace();
  }

  function revealEditorLocation(location: SourceLocation): void {
    if (editor === undefined) {
      return;
    }
    const model = editor.getModel();
    if (model === null) {
      return;
    }
    const lineNumber = clamp(Math.trunc(location.line), 1, model.getLineCount());
    const maxColumn = model.getLineMaxColumn(lineNumber);
    const column = clamp(Math.trunc(location.column) + 1, 1, maxColumn);
    const position = { lineNumber, column };
    editor.setPosition(position);
    editor.revealPositionInCenter(position, monaco.editor.ScrollType.Smooth);
    editor.focus();
  }

  async function newFile(): Promise<void> {
    const id = `untitled:${untitledCounter++}`;
    const sourceIdentity = virtualSourceIdentity(id);
    tabs = [
      ...tabs,
      {
        id,
        sourceIdentity,
        title: `Untitled ${untitledCounter - 1}`,
        content: '',
        svg: emptySvg('Unsaved file is not part of the project yet'),
        diagnostics: [],
        local: true,
        ...tabToolbarState()
      }
    ];
    refreshEditorTokenVocabulary();
    persistWorkspace();
    await activateTab(id);
  }

  function restoreLocalTab(tab: WorkspaceTabState): void {
    const id = uniqueTabId(tab.id);
    const sourceIdentity = tab.sourceIdentity ?? virtualSourceIdentity(id);
    ensureEditorModel(id, tab.content ?? '');
    tabs = [
      ...tabs,
      {
        id,
        sourceIdentity,
        title: tab.title,
        content: tab.content ?? '',
        svg: emptySvg('Unsaved file is not part of the project yet'),
        diagnostics: [],
        local: true,
        ...tabToolbarState(tab)
      }
    ];
    bumpUntitledCounter(id, tab.title);
    refreshEditorTokenVocabulary();
    scheduleLiveSyntaxCheck([{ sourceIdentity, content: tab.content ?? '' }]);
  }

  async function activateTab(id: string): Promise<void> {
    activeTabId = id;
    persistWorkspace();
    await tick();
    syncEditorToActiveTab();
    scheduleLink();
  }

  function closeTab(id: string): void {
    const tab = tabs.find((item) => item.id === id);
    if (tab?.filePath !== undefined) {
      removeLocalSource(projectId, tab.filePath);
      delete overlays[tab.filePath];
    }
    if (tab !== undefined) {
      delete localDiagnostics[tab.sourceIdentity];
      delete linkerDiagnostics[tab.sourceIdentity];
    }
    tabs = tabs.filter((tab) => tab.id !== id);
    const model = editorModels.get(id);
    if (model !== undefined) {
      if (editor?.getModel() === model) {
        editor.setModel(null);
      }
      model.dispose();
    }
    editorModels.delete(id);
    refreshEditorTokenVocabulary();
    if (activeTabId === id) {
      activeTabId = tabs.at(-1)?.id;
      syncEditorToActiveTab();
      scheduleLink();
    }
    persistWorkspace();
  }

  function syncEditorToActiveTab(): void {
    const tab = tabs.find((item) => item.id === activeTabId);
    if (editor === undefined || tab === undefined) {
      if (editor !== undefined) {
        suppressEditorChange = true;
        editor.setModel(null);
        editor.updateOptions({ readOnly: false });
        suppressEditorChange = false;
      }
      editorTabId = undefined;
      applyMarkersFor(activeTabId);
      return;
    }
    const model = ensureEditorModel(tab.id, tab.content);
    if (editorTabId === tab.id && editor.getModel() === model) {
      editor.updateOptions({ readOnly: tab.readOnly === true });
      applyMarkersFor(activeTabId);
      return;
    }
    suppressEditorChange = true;
    editor.setModel(model);
    editorTabId = tab.id;
    editor.updateOptions({ readOnly: tab.readOnly === true });
    suppressEditorChange = false;
    editor.layout();
    applyMarkersFor(activeTabId);
  }

  function scheduleLink(): void {
    const sequence = ++linkSequence;
    if (debounceHandle !== undefined) {
      window.clearTimeout(debounceHandle);
    }
    debounceHandle = window.setTimeout(() => void runLink(sequence), 500);
  }

  async function runLink(sequence: number): Promise<void> {
    const linkOverlays = overlaysForLink();
    const overlaySources = Object.entries(linkOverlays).map(([sourceIdentity, content]) => ({ sourceIdentity, content }));
    const syntaxDiagnostics = await checkSyntax(overlaySources);
    if (sequence !== linkSequence) {
      return;
    }
    const parsedSources = overlaySources.map((source) => source.sourceIdentity);
    updateLocalDiagnostics(parsedSources, syntaxDiagnostics);
    const linkableTabs = tabs.filter(isProjectSourceTab);
    const renderSourceIdentities = activeTab === undefined || !isProjectSourceTab(activeTab)
      ? linkableTabs.map((tab) => tab.sourceIdentity)
      : [activeTab.sourceIdentity];

    try {
      const link = await linkProject(projectId, renderSourceIdentities, linkOverlays, activeQuery);
      if (sequence !== linkSequence) {
        return;
      }
      updateLinkerDiagnostics(link.diagnostics, parsedSources);
      if (!hasErrorDiagnostics(link.diagnostics) && link.structure !== undefined) {
        acceptProjectStructureSnapshot(link.structure);
      }
      appendCycleSummary('Linker finished', link.diagnostics);
      if (link.diagnostics.some((diagnostic) => diagnostic.level === 'ERROR')) {
        clearTabDots(renderSourceIdentities);
        return;
      }
      if (link.renders.length === 0) {
        clearTabDots(renderSourceIdentities);
        return;
      }
      const rendered = await renderWithFallback(link.renders, renderSourceIdentities, linkOverlays, activeQuery);
      if (sequence !== linkSequence) {
        return;
      }
      if (rendered.diagnostics.length > 0) {
        appendCycleSummary('Renderer finished', rendered.diagnostics);
        if (rendered.diagnostics.some((diagnostic) => diagnostic.level === 'ERROR')) {
          clearTabDots(renderSourceIdentities);
          return;
        }
      }
      if (rendered.svgs.length === 0) {
        clearTabDots(renderSourceIdentities);
        appendErrorMessage('Renderer returned no SVG output');
        return;
      }
      const dotBySource = dotRendersBySource(link.renders);
      for (const svg of rendered.svgs) {
        updateTabBySourceIdentity(svg.sourceIdentity, { svg: svg.svg, dot: dotBySource.get(svg.sourceIdentity) });
      }
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      const message = errorMessage(error);
      if (isQueryErrorMessage(message)) {
        clearTabDots(renderSourceIdentities);
        appendQueryErrorMessage(message, activeQuery);
        return;
      }
      appendErrorMessage(`Server error: ${message}`);
    }
  }

  async function renderWithFallback(
    renders: Parameters<typeof renderDotInBrowser>[0],
    openSourceIdentities: string[],
    overlays: Record<string, string>,
    query: string
  ): Promise<Awaited<ReturnType<typeof renderProjectSvg>>> {
    try {
      return await renderDotInBrowser(renders);
    } catch {
      return renderProjectSvg(projectId, openSourceIdentities, overlays, query);
    }
  }

  function scheduleLiveSyntaxCheck(sources: Array<{ sourceIdentity: string; content: string }> = tabs.filter(isProjectSourceTab).map((tab) => ({
    sourceIdentity: tab.sourceIdentity,
    content: tab.content
  }))): void {
    const request = ++liveSyntaxSequence;
    void checkSyntax(sources).then((diagnostics) => {
      if (request !== liveSyntaxSequence) {
        return;
      }
      updateLocalDiagnostics(sources.map((source) => source.sourceIdentity), diagnostics);
    });
  }

  function checkSyntax(sources: Array<{ sourceIdentity: string; content: string }>): Promise<Diagnostic[]> {
    if (sources.length === 0) {
      return Promise.resolve([]);
    }
    if (languageWorker === undefined) {
      return Promise.resolve([]);
    }
    const worker = languageWorker;
    const requestId = ++syntaxSequence;
    return new Promise((resolve) => {
      syntaxResolvers.set(requestId, resolve);
      worker.postMessage({
        requestId,
        sources,
        snapshot: editorSymbols
      });
    });
  }

  function updateLinkerDiagnostics(diagnostics: Diagnostic[], preflightSources: string[] = []): void {
    if (preflightSources.length > 0) {
      localDiagnostics = omitDiagnostics(localDiagnostics, preflightSources);
    }
    linkerDiagnostics = diagnosticsBySource(diagnostics);
    refreshDiagnostics();
  }

  function updateLocalDiagnostics(checkedPaths: string[], diagnostics: Diagnostic[]): void {
    localDiagnostics = mergeDiagnostics(localDiagnostics, checkedPaths, diagnostics);
    refreshDiagnostics();
  }

  function omitDiagnostics(
    current: Record<string, Diagnostic[]>,
    sources: string[]
  ): Record<string, Diagnostic[]> {
    const next: Record<string, Diagnostic[]> = { ...current };
    for (const source of sources) {
      delete next[source];
    }
    return next;
  }

  function diagnosticsBySource(diagnostics: Diagnostic[]): Record<string, Diagnostic[]> {
    const result: Record<string, Diagnostic[]> = {};
    const byPath = new Map<string, Diagnostic[]>();
    for (const diagnostic of diagnostics) {
      const list = byPath.get(diagnostic.source) ?? [];
      list.push(diagnostic);
      byPath.set(diagnostic.source, list);
    }
    for (const [path, items] of byPath) {
      result[path] = items;
    }
    return result;
  }

  function mergeDiagnostics(
    current: Record<string, Diagnostic[]>,
    checkedPaths: string[],
    diagnostics: Diagnostic[]
  ): Record<string, Diagnostic[]> {
    const next: Record<string, Diagnostic[]> = { ...current };
    for (const path of checkedPaths) {
      delete next[path];
    }
    for (const diagnostic of diagnostics) {
      next[diagnostic.source] = [...(next[diagnostic.source] ?? []), diagnostic];
    }
    return next;
  }

  function refreshDiagnostics(): void {
    tabs = tabs.map((tab) => ({ ...tab, diagnostics: diagnosticsForTab(tab) }));
    for (const id of editorModels.keys()) {
      applyMarkersFor(id);
    }
  }

  function diagnosticsForTab(tab: WorkspaceTab): Diagnostic[] {
    return uniqueDiagnostics([
      ...(linkerDiagnostics[tab.sourceIdentity] ?? []),
      ...(localDiagnostics[tab.sourceIdentity] ?? [])
    ]);
  }

  function uniqueDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
    const result: Diagnostic[] = [];
    const seen = new Set<string>();
    for (const diagnostic of diagnostics) {
      const key = diagnosticKey(diagnostic);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(diagnostic);
    }
    return result;
  }

  function diagnosticKey(diagnostic: Diagnostic): string {
    return [
      diagnostic.source,
      diagnostic.level ?? '',
      diagnostic.code,
      diagnostic.message,
      diagnostic.line ?? '',
      diagnostic.column ?? '',
      diagnostic.endLine ?? '',
      diagnostic.endColumn ?? ''
    ].join('\u0000');
  }

  function diagnosticErrorSources(...sources: Array<Record<string, Diagnostic[]>>): Set<string> {
    const result = new Set<string>();
    for (const source of sources) {
      for (const [sourceIdentity, diagnostics] of Object.entries(source)) {
        if (diagnostics.some(isErrorDiagnostic)) {
          result.add(sourceIdentity);
        }
      }
    }
    return result;
  }

  function diagnosticsHaveErrors(source: Record<string, Diagnostic[]>): boolean {
    return Object.values(source).some((diagnostics) => diagnostics.some(isErrorDiagnostic));
  }

  function isErrorDiagnostic(diagnostic: Diagnostic): boolean {
    return diagnostic.level === 'ERROR';
  }

  function applyMarkersFor(id: string | undefined): void {
    if (editor === undefined || monaco === undefined || id === undefined) {
      return;
    }
    const model = editorModels.get(id);
    if (model === undefined) {
      return;
    }
    const tab = tabs.find((item) => item.id === id);
    monaco.editor.setModelMarkers(
      model,
      'insight',
      (tab === undefined ? [] : diagnosticsForTab(tab))
        .filter(isSourceDiagnostic)
        .map((diagnostic) => {
          const range = markerRange(model, diagnostic);
          return {
            startLineNumber: range.startLineNumber,
            startColumn: range.startColumn,
            endLineNumber: range.endLineNumber,
            endColumn: range.endColumn,
            code: diagnostic.code,
            source: 'insight',
            message: diagnostic.message,
            severity: markerSeverity(diagnostic)
          };
        })
    );
  }

  function isSourceDiagnostic(diagnostic: Diagnostic): diagnostic is Diagnostic & { line: number; column: number } {
    return (diagnostic.category === undefined || diagnostic.category === 'SOURCE')
      && diagnostic.line !== undefined
      && diagnostic.column !== undefined;
  }

  function markerRange(
    model: Monaco.editor.ITextModel,
    diagnostic: Diagnostic & { line: number; column: number }
  ): {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  } {
    if (diagnostic.endLine !== undefined && diagnostic.endColumn !== undefined) {
      return {
        startLineNumber: Math.max(1, diagnostic.line),
        startColumn: Math.max(1, diagnostic.column + 1),
        endLineNumber: Math.max(1, diagnostic.endLine),
        endColumn: Math.max(2, diagnostic.endColumn + 1)
      };
    }

    const lineNumber = Math.max(1, Math.min(diagnostic.line, model.getLineCount()));
    const text = model.getLineContent(lineNumber);
    const token = tokenRangeAt(text, diagnostic.column);
    return {
      startLineNumber: lineNumber,
      startColumn: token.start + 1,
      endLineNumber: lineNumber,
      endColumn: Math.max(token.start + 2, token.end + 1)
    };
  }

  function tokenRangeAt(text: string, column: number): { start: number; end: number } {
    if (text.length === 0) {
      return { start: 0, end: 1 };
    }

    let index = Math.max(0, Math.min(column, text.length - 1));
    if (column >= text.length || isTokenBreak(text[index])) {
      while (index > 0 && isTokenBreak(text[index])) {
        index--;
      }
      if (isTokenBreak(text[index])) {
        return { start: Math.max(0, Math.min(column, text.length)), end: Math.max(1, Math.min(column + 1, text.length + 1)) };
      }
    }

    let start = index;
    while (start > 0 && !isTokenBreak(text[start - 1])) {
      start--;
    }
    let end = index + 1;
    while (end < text.length && !isTokenBreak(text[end])) {
      end++;
    }
    return { start, end };
  }

  function isTokenBreak(char: string | undefined): boolean {
    return char === undefined || /\s/.test(char);
  }

  function markerSeverity(diagnostic: Diagnostic): Monaco.MarkerSeverity {
    if (diagnostic.level === 'ERROR') {
      return monaco.MarkerSeverity.Error;
    }
    if (diagnostic.level === 'WARNING') {
      return monaco.MarkerSeverity.Warning;
    }
    if (diagnostic.level === 'NOTE' || diagnostic.level === 'NOTICE') {
      return monaco.MarkerSeverity.Info;
    }
    return monaco.MarkerSeverity.Info;
  }

  function diagnosticPosition(diagnostic: Diagnostic): string {
    if (diagnostic.line === undefined || diagnostic.column === undefined) {
      return diagnostic.category === 'SYSTEM' ? 'system' : '-';
    }
    return `${diagnostic.line}:${diagnostic.column + 1}`;
  }

  function diagnosticMessage(diagnostic: Diagnostic): Omit<MessageView, 'id' | 'time'> {
    return {
      level: messageLevel(diagnostic),
      source: diagnosticSourceLabel(diagnostic.source),
      position: diagnosticPosition(diagnostic),
      message: diagnostic.message
    };
  }

  function diagnosticSourceLabel(sourceIdentity: string): string {
    if (!sourceIdentity.startsWith('__unsaved__/')) {
      return sourceIdentity;
    }
    return tabs.find((tab) => tab.sourceIdentity === sourceIdentity)?.title ?? sourceIdentity;
  }

  function taskSummaryMessage(task: string, diagnostics: Diagnostic[]): Omit<MessageView, 'id' | 'time'> {
    const counts = diagnosticCounts(diagnostics);
    return {
      level: 'INFO',
      position: '-',
      message: `${task}: errors: ${counts.errors}, warnings: ${counts.warnings}, notes: ${counts.notes}`
    };
  }

  function scrollMessagesToEnd(messages: MessageView[], visible: boolean, force = false): void {
    const signature = messages.map((message) => `${message.id}:${message.message}`).join('|');
    if (!visible || (!force && signature === lastAutoScrolledMessagesSignature)) {
      return;
    }
    lastAutoScrolledMessagesSignature = signature;
    void tick().then(() => {
      if (messagesPanel !== undefined) {
        messagesPanel.scrollTop = messagesPanel.scrollHeight;
      }
    });
  }

  function updateTab(id: string, patch: Partial<WorkspaceTab>): void {
    tabs = tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab));
  }

  function updateTabBySourceIdentity(sourceIdentity: string, patch: Partial<WorkspaceTab>): void {
    tabs = tabs.map((tab) => (tab.sourceIdentity === sourceIdentity ? { ...tab, ...patch } : tab));
  }

  function clearTabDots(sourceIdentities: string[]): void {
    const sources = new Set(sourceIdentities);
    tabs = tabs.map((tab) => sources.has(tab.sourceIdentity) ? { ...tab, dot: undefined } : tab);
  }

  function dotRendersBySource(renders: DotRender[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const render of renders) {
      result.set(render.sourceIdentity, render.dot);
    }
    return result;
  }

  function refreshEditorSymbols(): void {
    const openSymbols = buildLanguageSnapshotFromSources(tabs.filter(isProjectSourceTab).map((tab) => ({
      sourceName: tab.sourceIdentity,
      source: tab.content
    })));
    editorSymbols = mergeLanguageSnapshots([coreLanguageSnapshot, projectSymbols, openSymbols]);
  }

  function acceptProjectStructureSnapshot(structure: ProjectStructure): void {
    projectStructure = structure;
    workspaceCompletionSnapshot = completionSnapshotFromProjectStructure(
      structure,
      ++workspaceCompletionSnapshotRevision
    );
  }

  function refreshEditorTokenVocabulary(options: { readonly repaint?: boolean } = {}): void {
    refreshEditorSymbols();
    if (tokenVocabulary === undefined) {
      return;
    }
    refreshInsightTokenVocabulary(tokenVocabulary, editorSymbols, tabs.map((tab) => tab.content));
    if (options.repaint === false || monaco === undefined) {
      return;
    }
    for (const model of editorModels.values()) {
      monaco.editor.setModelLanguage(model, 'insight');
    }
    semanticTokensProvider.refresh();
    editor?.render(true);
  }

  function ensureEditorModel(id: string, content: string): Monaco.editor.ITextModel {
    const existing = editorModels.get(id);
    if (existing !== undefined) {
      if (existing.getValue() !== content && id !== activeTabId) {
        existing.setValue(content);
      }
      return existing;
    }
    const model = monaco.editor.createModel(content, 'insight', monaco.Uri.parse(`insight://tab/${id}`));
    editorModels.set(id, model);
    return model;
  }

  function persistWorkspace(): void {
    if (activeProjectId === undefined) {
      return;
    }
    const persistentTabs = tabs.filter(isProjectSourceTab);
    writeWorkspace(projectId, {
      tabs: persistentTabs.map(workspaceTabState),
      activeTab: activeTabId !== undefined && persistentTabs.some((tab) => tab.id === activeTabId) ? activeTabId : undefined,
      ui: projectUi
    });
  }

  function updateQuery(value: string): void {
    patchActiveTabToolbar({ query: value, diagramMode: diagramModeForQuery(value) ?? activeDiagramMode });
    clearActiveTabDot();
    persistWorkspace();
    scheduleLink();
  }

  function selectDiagramMode(mode: DiagramMode): void {
    patchActiveTabToolbar({ diagramMode: mode, query: queryForDiagramMode(mode) });
    clearActiveTabDot();
    persistWorkspace();
    scheduleLink();
  }

  async function saveActiveTab(): Promise<void> {
    const tab = activeTab;
    if (tab === undefined) {
      return;
    }
    if (tab.readOnly === true) {
      appendInfoMessage(`${tab.title} is read-only`);
      return;
    }
    if (tab.filePath === undefined) {
      openFileDialog({
        mode: 'save',
        target: 'file',
        title: 'Save file',
        directory: '',
        fileName: defaultDialogFileName(tab.title),
        tabId: tab.id,
        content: tab.content
      });
      return;
    }
    await saveTabToPath(tab, tab.filePath);
  }

  async function saveTabToPath(tab: WorkspaceTab, path: string): Promise<void> {
    try {
      const result = await saveFile(projectId, path, { content: tab.content });
      removeLocalSource(projectId, tab.filePath ?? path);
      removeLocalSource(projectId, result.path);
      delete overlays[tab.filePath ?? path];
      delete overlays[result.path];
      if (tab.filePath === undefined || tab.filePath !== result.path) {
        retargetOpenTab(tab.id, result.path, tab.content, false);
      } else {
        updateTab(tab.id, { local: false });
      }
      await refreshProjectMetadata();
      persistWorkspace();
      scheduleLink();
      appendFileSavedMessage(result.path);
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      appendErrorMessage(`Server error: ${errorMessage(error)}`);
    }
  }

  function downloadActiveSource(): void {
    const tab = activeTab;
    if (tab === undefined) {
      return;
    }
    downloadText(fileNameWithExtension(tab.title, '.ai'), tab.content, 'text/plain;charset=utf-8');
  }

  function downloadActiveDiagramSvg(): void {
    const tab = activeTab;
    if (tab === undefined || !canDownloadCurrentDiagram) {
      return;
    }
    downloadText(fileNameWithExtension(tab.title, '.svg'), tab.svg, 'image/svg+xml;charset=utf-8');
  }

  async function downloadActiveDiagramPng(): Promise<void> {
    const tab = activeTab;
    if (tab === undefined || !canDownloadCurrentDiagram) {
      return;
    }
    try {
      const blob = await svgToPngBlob(tab.svg);
      downloadBlob(fileNameWithExtension(tab.title, '.png'), blob);
    } catch (error) {
      appendErrorMessage(`Download failed: ${errorMessage(error)}`);
    }
  }

  function downloadActiveDiagramDot(): void {
    const tab = activeTab;
    if (tab?.dot === undefined) {
      return;
    }
    downloadText(fileNameWithExtension(tab.title, '.dot'), tab.dot, 'text/vnd.graphviz;charset=utf-8');
  }

  function downloadText(fileName: string, content: string, type: string): void {
    downloadBlob(fileName, new Blob([content], { type }));
  }

  function downloadBlob(fileName: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function svgToPngBlob(svg: string): Promise<Blob> {
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = new Image();
      const dimensions = svgDimensions(svg);
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('SVG image could not be decoded'));
        image.src = svgUrl;
      });
      const width = Math.max(1, Math.round(image.naturalWidth || dimensions.width || 1200));
      const height = Math.max(1, Math.round(image.naturalHeight || dimensions.height || 800));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context === null) {
        throw new Error('Canvas is not available');
      }
      context.drawImage(image, 0, 0, width, height);
      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob === null) {
            reject(new Error('PNG image could not be created'));
            return;
          }
          resolve(blob);
        }, 'image/png');
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  }

  function svgDimensions(svg: string): { width?: number; height?: number } {
    const documentSvg = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = documentSvg.documentElement;
    const width = svgLengthToPixels(root.getAttribute('width'));
    const height = svgLengthToPixels(root.getAttribute('height'));
    if (width !== undefined && height !== undefined) {
      return { width, height };
    }
    const viewBox = root.getAttribute('viewBox')?.trim().split(/\s+/).map(Number);
    return {
      width: width ?? (viewBox?.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : undefined),
      height: height ?? (viewBox?.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : undefined)
    };
  }

  function svgLengthToPixels(value: string | null): number | undefined {
    if (value === null) {
      return undefined;
    }
    const match = /^\s*([0-9.]+)\s*(px|pt|in|cm|mm)?\s*$/.exec(value);
    if (match === null) {
      return undefined;
    }
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) {
      return undefined;
    }
    const unit = match[2] ?? 'px';
    if (unit === 'pt') {
      return amount * 96 / 72;
    }
    if (unit === 'in') {
      return amount * 96;
    }
    if (unit === 'cm') {
      return amount * 96 / 2.54;
    }
    if (unit === 'mm') {
      return amount * 96 / 25.4;
    }
    return amount;
  }

  function fileNameWithExtension(title: string, extension: '.ai' | '.svg' | '.png' | '.dot'): string {
    const cleanTitle = sanitizeFileName(title.trim() || defaultNewFileName);
    const base = cleanTitle.replace(/\.(?:ai|svg|png|dot)$/i, '');
    return `${base}${extension}`;
  }

  function sanitizeFileName(value: string): string {
    return value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || defaultNewFileName;
  }

  function openRepositoryMenu(node: TreeNode, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    repositoryMenu = {
      node,
      x: event.clientX,
      y: event.clientY
    };
  }

  function newRepositoryFile(directory: string): void {
    closeRepositoryMenu();
    openFileDialog({
      mode: 'new',
      target: 'file',
      title: 'New file',
      directory,
      fileName: defaultNewFileName,
      content: ''
    });
  }

  function newRepositoryFolder(directory: string): void {
    closeRepositoryMenu();
    openFileDialog({
      mode: 'new',
      target: 'folder',
      title: 'New folder',
      directory,
      fileName: 'folder'
    });
  }

  function renameRepositoryFile(path: string): void {
    closeRepositoryMenu();
    openFileDialog({
      mode: 'rename',
      target: 'file',
      title: 'Rename or move',
      directory: parentDirectory(path),
      fileName: displayFileName(path),
      sourcePath: path
    });
  }

  function renameRepositoryFolder(path: string): void {
    closeRepositoryMenu();
    openFileDialog({
      mode: 'rename',
      target: 'folder',
      title: 'Rename or move folder',
      directory: parentDirectory(path),
      fileName: baseName(path),
      sourcePath: path
    });
  }

  function deleteRepositoryFile(path: string): void {
    closeRepositoryMenu();
    deleteDialog = { path, target: 'file' };
  }

  function deleteRepositoryFolder(path: string): void {
    closeRepositoryMenu();
    deleteDialog = { path, target: 'folder' };
  }

  function closeDeleteDialog(): void {
    deleteDialog = undefined;
  }

  async function confirmDeleteDialog(): Promise<void> {
    if (deleteDialog === undefined) {
      return;
    }
    const dialog = deleteDialog;
    try {
      const deletedFiles = dialog.target === 'folder' ? filePathsInDirectory(dialog.path) : [dialog.path];
      if (dialog.target === 'folder') {
        await deleteFolder(projectId, dialog.path);
      } else {
        await deleteFile(projectId, dialog.path);
      }
      for (const path of deletedFiles) {
        closeFileTab(path);
        removeLocalSource(projectId, path);
        delete overlays[path];
        delete localDiagnostics[path];
        delete linkerDiagnostics[path];
      }
      await refreshProjectMetadata();
      refreshDiagnostics();
      refreshEditorTokenVocabulary();
      persistWorkspace();
      scheduleLink();
      deleteDialog = undefined;
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      deleteDialog = { ...dialog, error: errorMessage(error) };
    }
  }

  function openFileDialog(state: FileDialogState): void {
    fileDialog = {
      ...state,
      fileName: state.fileName || defaultNewFileName,
      directory: state.directory ?? ''
    };
  }

  function closeFileDialog(): void {
    fileDialog = undefined;
  }

  async function confirmFileDialog(): Promise<void> {
    if (fileDialog === undefined) {
      return;
    }
    const dialog = fileDialog;
    const targetFileName = normalizeDialogName(dialog.fileName, dialog.target);
    const nameValidation = validateNodeName(targetFileName, dialog.target);
    if (nameValidation !== undefined) {
      fileDialog = { ...dialog, fileName: targetFileName, error: nameValidation };
      return;
    }
    const targetPath = joinPath(dialog.directory, targetFileName);
    const validation = validateTargetPath(
      targetPath,
      dialog.target,
      dialog.mode === 'rename' ? dialog.sourcePath : undefined
    );
    if (validation !== undefined) {
      fileDialog = { ...dialog, fileName: targetFileName, error: validation };
      return;
    }
    try {
      if (dialog.mode === 'rename') {
        if (dialog.sourcePath === undefined) {
          fileDialog = { ...dialog, error: `Source ${dialog.target} is missing` };
          return;
        }
        if (dialog.target === 'folder') {
          const result = await renameFolder(projectId, dialog.sourcePath, targetPath);
          retargetTabsForFolderRename(dialog.sourcePath, result.path);
        } else {
          const result = await renameFile(projectId, dialog.sourcePath, targetPath);
          retargetTabsForRename(dialog.sourcePath, result.path);
        }
        await refreshProjectMetadata();
        persistWorkspace();
        scheduleLink();
      } else {
        if (dialog.target === 'folder') {
          await createFolder(projectId, targetPath);
        } else {
          const content = dialog.content ?? '';
          const result = await saveFile(projectId, targetPath, { content });
          if (dialog.tabId !== undefined) {
            retargetOpenTab(dialog.tabId, result.path, content, false);
          } else {
            await openFile(result.path);
          }
          appendFileSavedMessage(result.path);
        }
        await refreshProjectMetadata();
        persistWorkspace();
        scheduleLink();
      }
      fileDialog = undefined;
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      fileDialog = { ...dialog, fileName: targetFileName, error: errorMessage(error) };
    }
  }

  function retargetTabsForRename(sourcePath: string, targetPath: string): void {
    const tab = tabs.find((item) => item.filePath === sourcePath);
    if (tab === undefined) {
      removeLocalSource(projectId, sourcePath);
      delete overlays[sourcePath];
      return;
    }
    retargetOpenTab(tab.id, targetPath, tab.content, tab.local);
    if (tab.local) {
      overlays[targetPath] = tab.content;
      writeLocalSource(projectId, targetPath, tab.content);
    }
    removeLocalSource(projectId, sourcePath);
    delete overlays[sourcePath];
  }

  function retargetTabsForFolderRename(sourcePath: string, targetPath: string): void {
    const files = filePathsInDirectory(sourcePath);
    for (const filePath of files) {
      const nextPath = replaceDirectoryPrefix(filePath, sourcePath, targetPath);
      retargetTabsForRename(filePath, nextPath);
    }
  }

  function retargetOpenTab(tabId: string, path: string, content: string, local: boolean): void {
    const tab = tabs.find((item) => item.id === tabId);
    if (tab === undefined) {
      return;
    }
    const targetId = uniqueTabId(path);
    const model = editorModels.get(tab.id);
    if (model !== undefined) {
      editorModels.delete(tab.id);
      editorModels.set(targetId, model);
    }
    if (activeTabId === tab.id) {
      activeTabId = targetId;
    }
    if (editorTabId === tab.id) {
      editorTabId = targetId;
    }
    delete localDiagnostics[tab.sourceIdentity];
    delete linkerDiagnostics[tab.sourceIdentity];
    tabs = tabs.map((item) => item.id === tab.id
      ? {
          ...item,
          id: targetId,
          filePath: path,
          sourceIdentity: path,
          title: baseName(path),
          content,
          local,
          diagnostics: []
        }
      : item);
    syncEditorToActiveTab();
    refreshDiagnostics();
    refreshEditorTokenVocabulary();
  }

  function closeFileTab(path: string): void {
    const tab = tabs.find((item) => item.filePath === path);
    if (tab !== undefined) {
      closeTab(tab.id);
    }
  }

  function filePathsInDirectory(directory: string): string[] {
    const result = new Set<string>();
    const root = treeNodeByPath(directory, 'directory');
    if (root !== undefined) {
      const visit = (node: TreeNode) => {
        if (node.type === 'file') {
          result.add(node.path);
          return;
        }
        for (const child of node.children) {
          visit(child);
        }
      };
      visit(root);
    }
    for (const tab of tabs) {
      if (tab.filePath !== undefined && isInsideDirectory(tab.filePath, directory)) {
        result.add(tab.filePath);
      }
    }
    return [...result];
  }

  function treeNodeByPath(path: string, type?: TreeNode['type']): TreeNode | undefined {
    if (tree === undefined) {
      return undefined;
    }
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) {
        continue;
      }
      if (node.path === path && (type === undefined || node.type === type)) {
        return node;
      }
      stack.push(...node.children);
    }
    return undefined;
  }

  function isInsideDirectory(path: string, directory: string): boolean {
    return path.startsWith(`${directory}/`);
  }

  function replaceDirectoryPrefix(path: string, sourceDirectory: string, targetDirectory: string): string {
    return `${targetDirectory}${path.slice(sourceDirectory.length)}`;
  }

  async function refreshProjectMetadata(): Promise<void> {
    const [treeResponse, symbols] = await Promise.all([
      fetchTree(projectId),
      fetchProjectSymbols(projectId)
    ]);
    tree = treeResponse.root;
    projectSymbols = symbols;
    refreshEditorTokenVocabulary();
  }

  function validateNodeName(name: string, target: FileDialogTarget): string | undefined {
    const label = target === 'folder' ? 'Folder' : 'File';
    if (name.length === 0) {
      return `${label} name is required`;
    }
    if (name.includes('/') || name.includes('\\')) {
      return `${label} name must not contain directories`;
    }
    if (target === 'folder' && name.endsWith('.ai')) {
      return 'Folder name must not use .ai extension';
    }
    return undefined;
  }

  function validateTargetPath(path: string, target: FileDialogTarget, sourcePath?: string): string | undefined {
    const label = target === 'folder' ? 'Folder' : 'File';
    if (path.length === 0) {
      return `${label} name is required`;
    }
    if (path.startsWith('/') || path.includes('../') || path === '..' || path.startsWith('..')) {
      return `${label} path must stay inside repository`;
    }
    if (path.length > 100) {
      return `${label} path is longer than 100 characters`;
    }
    if (target === 'folder' && sourcePath !== undefined && path.startsWith(`${sourcePath}/`)) {
      return 'Folder cannot be moved inside itself';
    }
    if (displayNodePath(sourcePath ?? '', target) !== path && treeNodeExists(path)) {
      return `Repository item already exists: ${path}`;
    }
    return undefined;
  }

  function treeNodeExists(path: string): boolean {
    return treeNodeByDisplayPath(path) !== undefined;
  }

  function treeNodeByDisplayPath(path: string): TreeNode | undefined {
    if (tree === undefined) {
      return undefined;
    }
    const stack = [tree];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) {
        continue;
      }
      if (displayNodePath(node.path, node.type === 'directory' ? 'folder' : 'file') === path) {
        return node;
      }
      stack.push(...node.children);
    }
    return undefined;
  }

  function directoryOptions(): TreeNode[] {
    if (tree === undefined) {
      return [];
    }
    const result: TreeNode[] = [];
    const visit = (node: TreeNode) => {
      if (node.type === 'directory') {
        result.push(node);
        for (const child of node.children) {
          visit(child);
        }
      }
    };
    visit(tree);
    return result;
  }

  function defaultDialogFileName(title: string): string {
    const value = title.trim();
    if (value.length === 0 || /^Untitled \d+$/.test(value)) {
      return defaultNewFileName;
    }
    return displayFileName(value);
  }

  function normalizeDialogName(name: string, target: FileDialogTarget): string {
    const normalized = name.trim().replace(/^\/+|\/+$/g, '');
    return target === 'file' ? stripInsightExtension(normalized) : normalized;
  }

  function displayFileName(path: string): string {
    return stripInsightExtension(baseName(path));
  }

  function displayFilePath(path: string): string {
    if (path.length === 0) {
      return '';
    }
    return joinPath(parentDirectory(path), displayFileName(path));
  }

  function displayNodePath(path: string, target: FileDialogTarget): string {
    if (target === 'folder') {
      return path;
    }
    return displayFilePath(path);
  }

  function stripInsightExtension(value: string): string {
    return value.endsWith('.ai') ? value.slice(0, -3) : value;
  }

  function baseName(path: string): string {
    return path.split('/').filter(Boolean).at(-1) ?? path;
  }

  function parentDirectory(path: string): string {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  }

  function joinPath(directory: string, fileName: string): string {
    const cleanDirectory = directory.trim().replace(/^\/+|\/+$/g, '');
    const cleanFileName = fileName.trim().replace(/^\/+|\/+$/g, '');
    return cleanDirectory.length === 0 ? cleanFileName : `${cleanDirectory}/${cleanFileName}`;
  }

  function refreshActiveDiagram(): void {
    if (refreshDisabled) {
      return;
    }
    refreshDisabled = true;
    clearActiveTabDot();
    scheduleLink();
    refreshCooldownHandle = window.setTimeout(() => {
      refreshDisabled = false;
      refreshCooldownHandle = undefined;
    }, 700);
  }

  function zoomActiveDiagram(step: number): void {
    const baseScale = Number.isFinite(diagramVisibleScale) ? diagramVisibleScale : activeDiagramScale;
    patchActiveTabToolbar({
      diagramScale: clamp(baseScale + step, minDiagramScale, maxDiagramScale),
      diagramFit: false
    });
    persistWorkspace();
  }

  function fitActiveDiagram(): void {
    patchActiveTabToolbar({ diagramFit: true });
    persistWorkspace();
  }

  function resetActiveDiagramScale(): void {
    patchActiveTabToolbar({ diagramScale: defaultDiagramScale, diagramFit: false });
    persistWorkspace();
  }

  function selectViewMode(mode: EditorViewMode): void {
    patchActiveTabToolbar({ viewMode: mode });
    persistWorkspace();
    void tick().then(() => editor?.layout());
  }

  function updateEditorSplitRatio(ratio: number): void {
    patchActiveTabToolbar({ editorSplitRatio: clamp(ratio, minEditorSplitRatio, maxEditorSplitRatio) });
    persistWorkspace();
  }

  function updateQueryPanelHeight(height: number): void {
    patchActiveTabToolbar({ queryPanelHeight: height });
    persistWorkspace();
    void tick().then(() => editor?.layout());
  }

  function updateDiagramVisibleScale(scale: number): void {
    diagramVisibleScale = clamp(scale, minDiagramScale, maxDiagramScale);
  }

  function toggleActiveQuery(): void {
    patchActiveTabToolbar({ queryVisible: !activeQueryVisible });
    persistWorkspace();
    void tick().then(() => editor?.layout());
  }

  function clearActiveTabDot(): void {
    if (activeTabId !== undefined) {
      updateTab(activeTabId, { dot: undefined });
    }
  }

  function patchActiveTabToolbar(
    patch: Partial<Pick<WorkspaceTab, 'diagramMode' | 'query' | 'queryVisible' | 'queryPanelHeight' | 'diagramScale' | 'diagramFit' | 'viewMode' | 'editorSplitRatio'>>
  ): void {
    if (activeTabId === undefined) {
      return;
    }
    updateTab(activeTabId, patch);
  }

  function normalizeViewMode(value: string | undefined): EditorViewMode | undefined {
    return value === 'split' || value === 'code' || value === 'diagram' ? value : undefined;
  }

  function normalizeDiagramScale(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, minDiagramScale, maxDiagramScale)
      : defaultDiagramScale;
  }

  function normalizeEditorSplitRatio(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, minEditorSplitRatio, maxEditorSplitRatio)
      : defaultEditorSplitRatio;
  }

  function normalizeQueryPanelHeight(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, 80, 360)
      : defaultQueryPanelHeight;
  }

  function workspaceTabState(tab: WorkspaceTab): WorkspaceTabState {
    if (tab.filePath !== undefined) {
      return {
        id: tab.id,
        filePath: tab.filePath,
        sourceIdentity: tab.sourceIdentity,
        title: tab.title,
        diagramMode: tab.diagramMode,
        query: tab.query,
        queryVisible: tab.queryVisible,
        queryPanelHeight: tab.queryPanelHeight,
        diagramScale: tab.diagramScale,
        diagramFit: tab.diagramFit,
        viewMode: tab.viewMode,
        editorSplitRatio: tab.editorSplitRatio
      };
    }
    return {
      id: tab.id,
      sourceIdentity: tab.sourceIdentity,
      title: tab.title,
      content: tab.content,
      diagramMode: tab.diagramMode,
      query: tab.query,
      queryVisible: tab.queryVisible,
      queryPanelHeight: tab.queryPanelHeight,
      diagramScale: tab.diagramScale,
      diagramFit: tab.diagramFit,
      viewMode: tab.viewMode,
      editorSplitRatio: tab.editorSplitRatio
    };
  }

  function tabToolbarState(
    tab?: Partial<WorkspaceTabState>
  ): Pick<WorkspaceTab, 'diagramMode' | 'query' | 'queryVisible' | 'queryPanelHeight' | 'diagramScale' | 'diagramFit' | 'viewMode' | 'editorSplitRatio'> {
    const query = tab?.query ?? defaultQuery;
    const diagramMode = normalizeDiagramMode(tab?.diagramMode) ?? diagramModeForQuery(query) ?? defaultDiagramMode;
    return {
      diagramMode,
      query,
      queryVisible: tab?.queryVisible ?? false,
      queryPanelHeight: normalizeQueryPanelHeight(tab?.queryPanelHeight),
      diagramScale: normalizeDiagramScale(tab?.diagramScale),
      diagramFit: tab?.diagramFit ?? false,
      viewMode: normalizeViewMode(tab?.viewMode) ?? defaultViewMode,
      editorSplitRatio: normalizeEditorSplitRatio(tab?.editorSplitRatio)
    };
  }

  function defaultProjectUi(): ProjectUiState {
    return {
      sidebarVisible: true,
      sidebarWidth: defaultSidebarWidth,
      messagesVisible: false,
      messagesHeight: defaultMessagesHeight
    };
  }

  function normalizeProjectUi(ui: WorkspaceUiState | undefined, tabsState: WorkspaceTabState[]): ProjectUiState {
    const legacyUi = tabsState.find((tab) => tab.ui !== undefined)?.ui;
    const source = ui ?? legacyUi;
    return {
      ...defaultProjectUi(),
      ...source,
      sidebarWidth: clamp(Number(source?.sidebarWidth ?? defaultSidebarWidth), minSidebarWidth, 720),
      messagesHeight: clamp(Number(source?.messagesHeight ?? defaultMessagesHeight), minMessagesHeight, 520)
    };
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function patchProjectUi(patch: Partial<ProjectUiState>): void {
    projectUi = normalizeProjectUi({ ...projectUi, ...patch }, []);
    persistWorkspace();
    void tick().then(() => editor?.layout());
  }

  function showSidebar(): void {
    patchProjectUi({ sidebarVisible: true });
  }

  function toggleSidebar(): void {
    patchProjectUi({ sidebarVisible: !projectUi.sidebarVisible });
  }

  function toggleMessages(): void {
    patchProjectUi({ messagesVisible: !projectUi.messagesVisible });
  }

  function beginSidebarResize(event: PointerEvent): void {
    if (!projectUi.sidebarVisible) {
      return;
    }
    sidebarResizeStart = {
      pointerId: event.pointerId,
      startX: event.clientX,
      width: projectUi.sidebarWidth
    };
    window.addEventListener('pointermove', resizeSidebar);
    window.addEventListener('pointerup', stopSidebarResize, { once: true });
  }

  function resizeSidebar(event: PointerEvent): void {
    if (sidebarResizeStart === undefined || event.pointerId !== sidebarResizeStart.pointerId) {
      return;
    }
    patchProjectUi({
      sidebarWidth: clamp(sidebarResizeStart.width + event.clientX - sidebarResizeStart.startX, minSidebarWidth, 720)
    });
  }

  function stopSidebarResize(): void {
    sidebarResizeStart = undefined;
    window.removeEventListener('pointermove', resizeSidebar);
  }

  function beginMessagesResize(event: PointerEvent): void {
    if (!projectUi.messagesVisible) {
      return;
    }
    messagesResizeStart = {
      pointerId: event.pointerId,
      startY: event.clientY,
      height: projectUi.messagesHeight
    };
    window.addEventListener('pointermove', resizeMessages);
    window.addEventListener('pointerup', stopMessagesResize, { once: true });
  }

  function resizeMessages(event: PointerEvent): void {
    if (messagesResizeStart === undefined || event.pointerId !== messagesResizeStart.pointerId) {
      return;
    }
    patchProjectUi({
      messagesHeight: clamp(messagesResizeStart.height + messagesResizeStart.startY - event.clientY, minMessagesHeight, 520)
    });
  }

  function stopMessagesResize(): void {
    messagesResizeStart = undefined;
    window.removeEventListener('pointermove', resizeMessages);
  }

  function appendMessages(entries: Array<Omit<MessageView, 'id' | 'time'>>): void {
    if (entries.length === 0) {
      return;
    }
    const created = entries.map((entry, index) => ({
      ...entry,
      id: `msg:${Date.now()}:${index}:${Math.random().toString(36).slice(2)}`,
      time: Date.now()
    }));
    systemMessages = [...systemMessages, ...created].slice(-maxMessages);
  }

  function appendErrorMessage(message: string): void {
    appendMessages([{ level: 'ERROR', message }]);
  }

  function appendInfoMessage(message: string): void {
    appendMessages([{ level: 'INFO', message }]);
  }

  function appendFileSavedMessage(path: string): void {
    appendInfoMessage(`Saved file: ${path}`);
  }

  function appendQueryErrorMessage(message: string, query: string): void {
    appendMessages([{
      level: 'ERROR',
      source: 'query',
      position: queryErrorPosition(message, query),
      message: `QUERY_ERROR: ${message}`
    }]);
  }

  function errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith('at ')) ?? 'Unknown error';
  }

  function isQueryErrorMessage(message: string): boolean {
    return /\bquery offset\b/i.test(message)
      || /\boffset \d+\b/i.test(message)
      || /^Unexpected query character\b/i.test(message)
      || /^Unclosed query string\b/i.test(message)
      || /^Query is too long\b/i.test(message)
      || /^Unknown query variable\b/i.test(message)
      || /^Boolean operator cannot\b/i.test(message);
  }

  function queryErrorPosition(message: string, query: string): string {
    const match = /(?:query offset|offset)\s+(\d+)/i.exec(message);
    if (match === null) {
      return '-';
    }
    const offset = Number(match[1]);
    if (!Number.isFinite(offset)) {
      return '-';
    }
    return queryOffsetPosition(query, offset);
  }

  function queryOffsetPosition(query: string, offset: number): string {
    const clamped = clamp(offset, 0, query.length);
    const prefix = query.slice(0, clamped);
    const lines = prefix.split(/\r?\n/);
    const line = lines.length;
    const column = (lines.at(-1)?.length ?? 0) + 1;
    return `${line}:${column}`;
  }

  function appendCycleSummary(task: string, diagnostics: Diagnostic[]): void {
    appendMessages([
      ...diagnostics.map(diagnosticMessage),
      taskSummaryMessage(task, diagnostics)
    ]);
  }

  function diagnosticCounts(diagnostics: Diagnostic[]): { errors: number; warnings: number; notes: number } {
    let errors = 0;
    let warnings = 0;
    let notes = 0;
    for (const diagnostic of diagnostics) {
      if (diagnostic.level === 'ERROR') {
        errors += 1;
      } else if (diagnostic.level === 'WARNING') {
        warnings += 1;
      } else {
        notes += 1;
      }
    }
    return { errors, warnings, notes };
  }

  function messageLevel(diagnostic: Diagnostic): MessageView['level'] {
    if (diagnostic.level === 'ERROR') {
      return 'ERROR';
    }
    if (diagnostic.level === 'WARNING') {
      return 'WARNING';
    }
    return 'NOTE';
  }

  function uniqueTabId(id: string): string {
    if (!tabs.some((tab) => tab.id === id)) {
      return id;
    }
    let suffix = 2;
    let next = `${id}-${suffix}`;
    while (tabs.some((tab) => tab.id === next)) {
      suffix += 1;
      next = `${id}-${suffix}`;
    }
    return next;
  }

  function bumpUntitledCounter(id: string, title: string): void {
    const match = /^(?:untitled:|Untitled )(\d+)$/.exec(id) ?? /^(?:untitled:|Untitled )(\d+)$/.exec(title);
    if (match === null) {
      return;
    }
    untitledCounter = Math.max(untitledCounter, Number(match[1]) + 1);
  }

  function overlaysForLink(): Record<string, string> {
    const result = { ...overlays };
    for (const tab of tabs) {
      if (tab.filePath === undefined && isProjectSourceTab(tab)) {
        result[tab.sourceIdentity] = tab.content;
      }
    }
    return result;
  }

  function isProjectSourceTab(tab: WorkspaceTab): boolean {
    return tab.projectSource !== false;
  }

  function tabTitle(tab: WorkspaceTab): string {
    return tab.readOnly === true ? `[r] ${tab.title}` : tab.title;
  }

  function virtualSourceIdentity(id: string): string {
    return `__unsaved__/${id.replace(/[^A-Za-z0-9_-]/g, '-')}.ai`;
  }

  function emptySvg(message: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600" viewBox="0 0 900 600"><rect width="900" height="600" fill="#2e2e2e"/><text x="32" y="54" fill="#a8a8a8" font-family="monospace" font-size="16">${message}</text></svg>`;
  }
</script>

<main class="workspace" style={workspaceStyle}>
  <ProjectNavigationPanel
    {tree}
    hasActiveProject={activeProjectId !== undefined}
    symbols={editorSymbols}
    structure={projectStructure}
    activePath={activeFilePath}
    errorPaths={errorSourceIdentities}
    ui={projectUi}
    visible={sidebarVisible}
    onOpen={(path) => void openFile(path)}
    onRepositoryContextMenu={openRepositoryMenu}
    onOpenDeclaration={(declaration) => void goToDeclaration(declaration)}
    onShowSidebar={showSidebar}
    onToggleSidebar={toggleSidebar}
    onToggleMessages={toggleMessages}
    onBeginSidebarResize={beginSidebarResize}
  />

  <section class="main">
    <div class="auth-menu-host">
      <AuthMenu
        user={currentUser}
        onLogin={login}
        onSettings={openSettings}
        onLogout={() => void logout()}
      />
    </div>
    <section class="tabs">
      {#each tabs as tab (tab.id)}
        <div class:active={tab.id === activeTabId} class:error-tab={errorSourceIdentities.has(tab.sourceIdentity)} class="tab">
          <button class="tab-main" type="button" on:click={() => void activateTab(tab.id)}>
            <span class="tab-title"><span class="tab-title-text">{tabTitle(tab)}</span></span>
            {#if tab.local}<span class="dirty">•</span>{/if}
          </button>
          <button aria-label={`Close ${tab.title}`} class="close has-tooltip" data-tooltip={`Close ${tab.title}`} type="button" on:click={() => closeTab(tab.id)}>
            <span aria-hidden="true" class="codicon codicon-close"></span>
          </button>
        </div>
      {/each}
    </section>

    <WorkspaceEditor
      active={activeTab !== undefined}
      svg={activeTab?.svg}
      diagramMode={activeDiagramMode}
      query={activeQuery}
      queryVisible={activeQueryVisible}
      queryPanelHeight={activeQueryPanelHeight}
      viewMode={activeViewMode}
      diagramScale={activeDiagramScale}
      diagramFit={activeDiagramFit}
      editorSplitRatio={activeEditorSplitRatio}
      messages={panelMessages}
      messagesVisible={projectUi.messagesVisible}
      {workAreaStyle}
      bind:editorHost
      bind:messagesPanel
      {refreshDisabled}
      {emptyStrategy}
      onEmptyAction={handleEmptyWorkspaceAction}
      onSelectDiagramMode={selectDiagramMode}
      onToggleQuery={toggleActiveQuery}
      onQueryChange={updateQuery}
      onQueryPanelHeightChange={updateQueryPanelHeight}
      onZoomIn={() => zoomActiveDiagram(0.06)}
      onZoomOut={() => zoomActiveDiagram(-0.06)}
      onFitDiagram={fitActiveDiagram}
      onActualSize={resetActiveDiagramScale}
      onSelectViewMode={selectViewMode}
      onRefresh={refreshActiveDiagram}
      onEditorSplitRatioChange={updateEditorSplitRatio}
      onDiagramVisibleScaleChange={updateDiagramVisibleScale}
      onOpenDeclaration={goToDeclaration}
      onBeginMessagesResize={beginMessagesResize}
    >
      <WorkspaceToolbar
        slot="leading-actions"
        onNewFile={() => void newFile()}
        onSave={() => void saveActiveTab()}
        onDownloadSource={downloadActiveSource}
        onDownloadSvg={downloadActiveDiagramSvg}
        onDownloadPng={() => void downloadActiveDiagramPng()}
        onDownloadDot={downloadActiveDiagramDot}
        canDownloadSvg={canDownloadCurrentDiagram}
        canDownloadPng={canDownloadCurrentDiagram}
        canDownloadDot={canDownloadCurrentDot}
        saveDisabled={activeReadOnly}
      />
    </WorkspaceEditor>
  </section>
</main>

{#if repositoryMenu !== undefined}
  <div
    class="context-menu"
    style={`left: ${repositoryMenu.x}px; top: ${repositoryMenu.y}px;`}
    role="menu"
    tabindex="0"
    on:click|stopPropagation
    on:keydown={(event) => event.key === 'Escape' && closeRepositoryMenu()}
    on:contextmenu|preventDefault
  >
    {#if repositoryMenu.node.type === 'directory'}
      <button type="button" role="menuitem" on:click={() => newRepositoryFile(repositoryMenu?.node.path ?? '')}>
        <span aria-hidden="true" class="codicon codicon-new-file"></span>
        <span>New file</span>
      </button>
      <button type="button" role="menuitem" on:click={() => newRepositoryFolder(repositoryMenu?.node.path ?? '')}>
        <span aria-hidden="true" class="codicon codicon-new-folder"></span>
        <span>New folder</span>
      </button>
      {#if repositoryMenu.node.path !== ''}
        <button type="button" role="menuitem" on:click={() => repositoryMenu && renameRepositoryFolder(repositoryMenu.node.path)}>
          <span aria-hidden="true" class="codicon codicon-edit"></span>
          <span>Rename / Move</span>
        </button>
        <button type="button" role="menuitem" on:click={() => repositoryMenu && deleteRepositoryFolder(repositoryMenu.node.path)}>
          <span aria-hidden="true" class="codicon codicon-trash"></span>
          <span>Delete</span>
        </button>
      {/if}
    {:else}
      <button type="button" role="menuitem" on:click={() => repositoryMenu && renameRepositoryFile(repositoryMenu.node.path)}>
        <span aria-hidden="true" class="codicon codicon-edit"></span>
        <span>Rename / Move</span>
      </button>
      <button type="button" role="menuitem" on:click={() => repositoryMenu && deleteRepositoryFile(repositoryMenu.node.path)}>
        <span aria-hidden="true" class="codicon codicon-trash"></span>
        <span>Delete</span>
      </button>
    {/if}
  </div>
{/if}

{#if deleteDialog !== undefined}
  <div class="modal-backdrop" role="presentation" on:click={closeDeleteDialog}>
    <div
      class="file-dialog confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={deleteDialog.target === 'folder' ? 'Delete folder' : 'Delete file'}
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => event.stopPropagation()}
    >
      <form on:submit|preventDefault={() => void confirmDeleteDialog()}>
        <header>
          <h2>{deleteDialog.target === 'folder' ? 'Delete folder' : 'Delete file'}</h2>
        </header>
        <div class="file-dialog-body confirm-dialog-body">
          <p>
            {deleteDialog.target === 'folder'
              ? 'Are you sure you want to delete this folder and all files inside it?'
              : 'Are you sure you want to delete this file?'}
          </p>
          <div class="target-preview">{deleteDialog.path}</div>
          {#if deleteDialog.error !== undefined}
            <div class="dialog-error">{deleteDialog.error}</div>
          {/if}
        </div>
        <footer>
          <button type="button" on:click={closeDeleteDialog}>Cancel</button>
          <button type="submit">OK</button>
        </footer>
      </form>
    </div>
  </div>
{/if}

{#if fileDialog !== undefined}
  <div class="modal-backdrop" role="presentation" on:click={closeFileDialog}>
    <div
      class="file-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={fileDialog.title}
      tabindex="-1"
      on:click|stopPropagation
      on:keydown={(event) => event.stopPropagation()}
    >
      <form on:submit|preventDefault={() => void confirmFileDialog()}>
        <header>
          <h2>{fileDialog.title}</h2>
        </header>
        <div class="file-dialog-body">
          <div class="directory-picker" aria-label="Directories">
            {#each directoryOptions() as directory (directory.path || '__root__')}
              <button
                type="button"
                class:active={fileDialog.directory === directory.path}
                style={`--depth: ${directory.path === '' ? 0 : directory.path.split('/').length}`}
                on:click={() => fileDialog = fileDialog && { ...fileDialog, directory: directory.path, error: undefined }}
              >
                <span aria-hidden="true" class="codicon codicon-folder"></span>
                <span>{directory.path === '' ? directory.name : directory.path}</span>
              </button>
            {/each}
          </div>
          <label class="file-name-field">
            <span>Name</span>
            <input
              autocomplete="off"
              spellcheck="false"
              bind:value={fileDialog.fileName}
              on:input={() => fileDialog = fileDialog && { ...fileDialog, error: undefined }}
            />
          </label>
          <div class="target-preview">
            {joinPath(fileDialog.directory, normalizeDialogName(fileDialog.fileName, fileDialog.target)) || '-'}
          </div>
          {#if fileDialog.error !== undefined}
            <div class="dialog-error">{fileDialog.error}</div>
          {/if}
        </div>
        <footer>
          <button type="button" on:click={closeFileDialog}>Cancel</button>
          <button type="submit">OK</button>
        </footer>
      </form>
    </div>
  </div>
{/if}

<style>
  .workspace {
    display: grid;
    width: 100vw;
    height: 100vh;
    background: #252525;
  }

  .codicon-close::before {
    content: "\ea76";
  }

  .has-tooltip {
    position: relative;
  }

  .has-tooltip::after {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    z-index: 30;
    max-width: 220px;
    padding: 6px 8px;
    border: 1px solid #444444;
    border-radius: 4px;
    background: #181818;
    color: #eeeeee;
    content: attr(data-tooltip);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    opacity: 0;
    pointer-events: none;
    text-align: center;
    transform: translate(-50%, -2px);
    transition: opacity 120ms ease, transform 120ms ease;
    transition-delay: 0ms;
    white-space: nowrap;
  }

  .has-tooltip:hover::after,
  .has-tooltip:focus-visible::after {
    opacity: 1;
    transform: translate(-50%, 0);
    transition-delay: 300ms;
  }

  .main {
    position: relative;
    display: grid;
    grid-template-rows: 36px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .auth-menu-host {
    position: absolute;
    top: 4px;
    right: 8px;
    z-index: 20;
  }

  .tabs {
    display: flex;
    min-width: 0;
    padding-right: 44px;
    overflow: auto hidden;
    border-bottom: 1px solid #393939;
    background: #2b2b2b;
  }

  .tab {
    display: flex;
    align-items: center;
    min-width: 118px;
    max-width: 190px;
    height: 100%;
    border-right: 1px solid #3a3a3a;
    border-bottom: 2px solid transparent;
    background: #2d2d2d;
    color: #d8d8d8;
  }

  .tab.active {
    border-bottom-color: var(--color-primary);
    background: #303030;
    color: #ffffff;
  }

  .tab-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    height: 100%;
    flex: 1;
    padding: 0 6px 0 10px;
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 12px;
  }

  .tab-title {
    position: relative;
    min-width: 0;
    overflow: visible;
  }

  .tab-title-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .error-tab .tab-title::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: -4px;
    left: 0;
    height: 8px;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg width='8' height='8' viewBox='0 0 8 8' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 4 C1 2 3 2 4 4 C5 6 7 6 8 4' fill='none' stroke='%23ff5c57' stroke-width='1.3'/%3E%3C/svg%3E");
    background-repeat: repeat-x;
    background-position: left center;
    background-size: 8px 8px;
  }

  .dirty {
    color: var(--color-primary);
  }

  .close {
    width: 28px;
    height: 100%;
    border: 0;
    background: transparent;
    color: #b5b5b5;
  }

  .close .codicon {
    font-size: 13px;
  }

  .close:hover {
    color: #ffffff;
    background: #3a3a3a;
  }

  .context-menu {
    position: fixed;
    z-index: 80;
    min-width: 172px;
    padding: 4px;
    border: 1px solid #454545;
    border-radius: 4px;
    background: #252525;
    box-shadow: 0 12px 28px rgb(0 0 0 / 34%);
  }

  .context-menu button {
    display: grid;
    grid-template-columns: 20px 1fr;
    align-items: center;
    width: 100%;
    min-height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #e5e5e5;
    font: inherit;
    font-size: 12px;
    text-align: left;
  }

  .context-menu button:hover,
  .context-menu button:focus-visible {
    background: #36511f;
    color: #ffffff;
    outline: none;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 38%);
    -webkit-backdrop-filter: blur(5px);
    backdrop-filter: blur(5px);
  }

  .file-dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: min(620px, calc(100vh - 32px));
    border: 1px solid #474747;
    border-radius: 6px;
    background: #252525;
    color: #eeeeee;
    box-shadow: 0 18px 50px rgb(0 0 0 / 45%);
  }

  .file-dialog form {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    max-height: inherit;
  }

  .confirm-dialog {
    width: min(420px, calc(100vw - 32px));
  }

  .file-dialog header {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 16px;
    border-bottom: 1px solid #3a3a3a;
  }

  .file-dialog h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }

  .file-dialog-body {
    display: grid;
    gap: 12px;
    min-height: 0;
    padding: 12px 16px;
  }

  .confirm-dialog-body p {
    margin: 0;
    color: #d8d8d8;
    font-size: 13px;
    line-height: 1.4;
  }

  .directory-picker {
    min-height: 180px;
    max-height: 280px;
    overflow: auto;
    border: 1px solid #3d3d3d;
    border-radius: 4px;
    background: #202020;
  }

  .directory-picker button {
    display: grid;
    grid-template-columns: 20px 1fr;
    align-items: center;
    width: 100%;
    min-height: 28px;
    padding: 0 10px 0 calc(10px + var(--depth) * 16px);
    border: 0;
    background: transparent;
    color: #d8d8d8;
    font: inherit;
    font-size: 12px;
    text-align: left;
  }

  .directory-picker button:hover,
  .directory-picker button:focus-visible {
    background: #2f2f2f;
    outline: none;
  }

  .directory-picker button.active {
    background: #36511f;
    color: #ffffff;
  }

  .file-name-field {
    display: grid;
    gap: 6px;
    font-size: 12px;
    color: #cfcfcf;
  }

  .file-name-field input {
    width: 100%;
    height: 32px;
    box-sizing: border-box;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #1f1f1f;
    color: #ffffff;
    font: inherit;
    padding: 0 9px;
  }

  .file-name-field input:focus {
    border-color: var(--color-primary);
    outline: none;
  }

  .target-preview {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #a8a8a8;
    font-family: "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }

  .dialog-error {
    color: #ff8787;
    font-size: 12px;
  }

  .file-dialog footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #3a3a3a;
  }

  .file-dialog footer button {
    min-width: 76px;
    height: 30px;
    border: 1px solid #484848;
    border-radius: 4px;
    background: #2b2b2b;
    color: #eeeeee;
    font: inherit;
    font-size: 12px;
  }

  .file-dialog footer button:hover,
  .file-dialog footer button:focus-visible {
    border-color: #5a5a5a;
    background: #36511f;
    color: #ffffff;
    outline: none;
  }

  .file-dialog footer button[type="submit"] {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: #121212;
  }

  .file-dialog footer button[type="submit"]:hover,
  .file-dialog footer button[type="submit"]:focus-visible {
    border-color: #4be08a;
    background: #4be08a;
    color: #101010;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: 240px 1fr;
    }
  }
</style>
