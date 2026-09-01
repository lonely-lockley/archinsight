<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import 'monaco-editor';
  import {
    buildLanguageSnapshotFromSources,
    coreLanguageSnapshot,
    coreSource,
    coreSources,
    mergeLanguageSnapshots,
    type LanguageSnapshot,
    type LinkProjectResult
  } from '@insight/language';
  import AuthMenu from '$lib/AuthMenu.svelte';
  import ProjectNavigationPanel from '$lib/ProjectNavigationPanel.svelte';
  import {
    defaultDiagramMode,
    defaultQuery
  } from '$lib/diagram-query-presets';
  import WorkspaceEditor from '$lib/WorkspaceEditor.svelte';
  import WorkspaceToolbar from '$lib/WorkspaceToolbar.svelte';
  import WorkspaceTabs from '$lib/workspace/shell/WorkspaceTabs.svelte';
  import { renderDotInBrowser, terminateBrowserGraphvizWorker } from '$lib/graphviz-renderer';
  import { sanitizeSvg } from '$lib/svg-sanitizer';
  import {
    completionSnapshotFromProjectStructure,
    emptyWorkspaceCompletionSnapshot,
    type WorkspaceCompletionSnapshot
  } from '$lib/workspace-completion-snapshot';
  import {
    createFolder,
    createProject,
    deleteProject,
    deleteFile,
    deleteFolder,
    fetchFile,
    fetchCurrentUser,
    fetchProjects,
    fetchPlaygroundPublication,
    fetchTree,
    linkProject,
    logoutCurrentUser,
    publishToPlayground,
    renameFile,
    renameFolder,
    renderProjectSvg,
    routePath,
    saveFile,
    unpublishFromPlayground,
    updateProject,
    type AppCapability,
    type AuthUserResponse,
    type Diagnostic,
    type ProjectStructure
  } from '$lib/api';
  import type { WorkspaceSurface } from '$lib/actions/action-model';
  import {
    clearLocalWorkspaceStorage,
    clearProjectStorage,
    hasLocalSource,
    readProjectRegistry,
    readLocalSource,
    readWorkspace,
    removeLocalSource,
    type ProjectRegistryState,
    writeLocalSource,
    writeProjectRegistry,
    writeWorkspace
  } from '$lib/storage';
  import {
    diagnosticErrorSources,
    diagnosticsHaveErrors
  } from '$lib/workspace/analysis/diagnostics';
  import { createAnalysisController, type AnalysisController } from '$lib/workspace/analysis/analysis-controller';
  import { createAnalysisRunner, type AnalysisRunner } from '$lib/workspace/analysis/analysis-runner';
  import { createAuthController } from '$lib/workspace/auth/auth-controller';
  import { createDiagramController } from '$lib/workspace/diagram/diagram-controller';
  import {
    downloadBlob,
    downloadText,
    svgToPngBlob
  } from '$lib/workspace/diagram/download';
  import { createDownloadController } from '$lib/workspace/diagram/download-controller';
  import { createTabController } from '$lib/workspace/editor/tab-controller';
  import { createMonacoSession, type MonacoSession } from '$lib/workspace/editor/monaco-session';
  import {
    createWorkspaceFileController,
    type WorkspaceFileController
  } from '$lib/workspace/editor/workspace-file-controller';
  import {
    isProjectSourceTab
  } from '$lib/workspace/editor/tab-persistence';
  import {
    createMessageController,
    errorMessage
  } from '$lib/workspace/messages/message-controller';
  import ProjectDialog from '$lib/workspace/projects/ProjectDialog.svelte';
  import { createProjectController } from '$lib/workspace/projects/project-controller';
  import { createProjectDialogController } from '$lib/workspace/projects/project-dialog-controller';
  import type { ProjectDialogState } from '$lib/workspace/projects/project-dialog-types';
  import {
    createProjectSessionController,
    emptyProjectSymbols,
    type ProjectSessionController
  } from '$lib/workspace/projects/project-session-controller';
  import { createRepositoryController } from '$lib/workspace/repository/repository-controller';
  import { createRepositoryDialogController } from '$lib/workspace/repository/repository-dialog-controller';
  import RepositoryDeleteDialog from '$lib/workspace/repository/RepositoryDeleteDialog.svelte';
  import RepositoryContextMenu from '$lib/workspace/repository/RepositoryContextMenu.svelte';
  import RepositoryFileDialog from '$lib/workspace/repository/RepositoryFileDialog.svelte';
  import type {
    DeleteDialogState,
    FileDialogState
  } from '$lib/workspace/repository/repository-dialog-types';
  import { repositoryDirectories } from '$lib/workspace/repository/repository-tree';
  import { createLayoutController } from '$lib/workspace/shell/layout-controller';
  import {
    createWorkspaceActionController,
    type WorkspaceActionController
  } from '$lib/workspace/shell/workspace-action-controller';
  import {
    clamp,
    collapsedSidebarWidth,
    defaultProjectUi,
    minMessagesHeight,
    minSidebarWidth,
    normalizeProjectUi
  } from '$lib/workspace/shell/layout-model';
  import type { MessageView, ProjectUiState, TreeNode, WorkspaceTab } from '$lib/workspace-types';

  const defaultViewMode = 'split' as const;
  const defaultDiagramScale = 1;
  const defaultEditorSplitRatio = 50;
  const defaultQueryPanelHeight = 118;
  const coreSourceIdentity = coreSources.some((source) => source.sourceName === 'core.ai') ? 'core.ai' : coreSources[0]?.sourceName ?? 'core.ai';
  const coreSourceByName = new Map(coreSources.map((source) => [source.sourceName, source.source]));
  function readonlyCoreTabId(sourceIdentity: string): string {
    return `__readonly__/${sourceIdentity}`;
  }

  export let surface: WorkspaceSurface = 'editor';

  let analysisController!: AnalysisController;
  let analysisRunner!: AnalysisRunner;
  let monacoSession!: MonacoSession;
  let projectSession!: ProjectSessionController;
  let fileController!: WorkspaceFileController;
  let actionController!: WorkspaceActionController;

  const authController = createAuthController({
    surface: () => surface,
    currentUser: () => currentUser,
    setCurrentUser: (user) => {
      currentUser = user;
    },
    fetchCurrentUser,
    logoutCurrentUser,
    clearLocalWorkspaceStorage,
    routePath,
    currentLocation: () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
    navigate: (href) => {
      window.location.href = href;
    },
    error: (message) => messageController.error(message)
  });

  const repositoryController = createRepositoryController({
    createFolder,
    deleteFile,
    deleteFolder,
    renameFile,
    renameFolder,
    saveFile
  });
  const repositoryDialogController = createRepositoryDialogController({
    fileDialog: () => fileDialog,
    setFileDialog: (dialog) => {
      fileDialog = dialog;
    },
    deleteDialog: () => deleteDialog,
    setDeleteDialog: (dialog) => {
      deleteDialog = dialog;
    },
    closeMenu: closeRepositoryMenu,
    authorize: (actionId) => actionController.authorizeRepositoryAction(actionId),
    projectId: () => projectId,
    tree: () => tree,
    openFilePaths: () => openRepositoryFilePaths,
    commands: repositoryController,
    acceptDeletedFiles: (paths) => fileController.acceptDeletedFiles(paths),
    acceptFileEffect: (effect) => fileController.acceptFileEffect(effect),
    refreshProjectMetadata: () => fileController.refreshProjectMetadata(),
    persistWorkspace: () => fileController.persistWorkspace(),
    scheduleLink: () => analysisController.scheduleLink(),
    redirectIfAuthRequired: authController.redirectIfAuthRequired
  });
  const projectController = createProjectController({
    acceptCreatedProject: (project) => projectSession.acceptCreatedProject(project),
    acceptUpdatedProject: (project) => projectSession.acceptUpdatedProject(project),
    acceptPublishedProjectId: (projectId) => {
      publishedProjectId = projectId;
    },
    createProject,
    updateProject,
    deleteProject,
    publishToPlayground,
    unpublishFromPlayground
  });
  const projectDialogController = createProjectDialogController({
    dialog: () => projectDialog,
    setDialog: (dialog) => {
      projectDialog = dialog;
    },
    projects: () => projectRegistry.projects,
    publishedProjectId: () => publishedProjectId,
    publicationAllowed: () => !publicationFormState.hidden && !publicationFormState.disabled,
    commands: projectController,
    switchProject: (projectId) => projectSession.switchProject(projectId),
    acceptDeletedProject: (projectId) => projectSession.acceptDeletedProject(projectId),
    redirectIfAuthRequired: authController.redirectIfAuthRequired
  });
  const tabController = createTabController({
    readState: () => ({ tabs, activeTabId, editorTabId }),
    writeState: (state) => {
      tabs = state.tabs;
      activeTabId = state.activeTabId;
      editorTabId = state.editorTabId;
    }
  });
  analysisController = createAnalysisController({
    schedule: (task, delay) => window.setTimeout(task, delay),
    cancel: (handle) => window.clearTimeout(handle),
    currentProjectId: () => projectId,
    linkedAnalysis: () => linkedAnalysis,
    clearLinkedAnalysis: () => {
      linkedAnalysis = undefined;
    },
    closeDeploymentPicker: () => {
      deploymentPickerOpen = false;
    },
    runLink: (sequence) => analysisRunner.runLink(sequence),
    runCachedDiagram: (sequence, requestedProjectId, analysis) => (
      analysisRunner.runCachedDiagram(sequence, requestedProjectId, analysis)
    ),
    checkSyntax: (sources) => monacoSession.checkSyntax(sources),
    defaultSyntaxSources: () => tabs.filter(isProjectSourceTab).map((tab) => ({
      sourceIdentity: tab.sourceIdentity,
      content: tab.content
    })),
    readDiagnostics: () => ({ local: localDiagnostics, linker: linkerDiagnostics }),
    writeDiagnostics: (state) => {
      localDiagnostics = state.local;
      linkerDiagnostics = state.linker;
      refreshDiagnostics();
    }
  });
  const diagramController = createDiagramController({
    activeTab: () => activeTab,
    linkedAnalysis: () => linkedAnalysis,
    pickerOpen: () => deploymentPickerOpen,
    setPickerOpen: (open) => {
      deploymentPickerOpen = open;
    },
    refreshDisabled: () => refreshDisabled,
    setRefreshDisabled: (disabled) => {
      refreshDisabled = disabled;
    },
    visibleScale: () => diagramVisibleScale,
    setVisibleScale: (scale) => {
      diagramVisibleScale = scale;
    },
    patchActiveTab: (patch) => {
      if (activeTabId !== undefined) {
        tabController.patch(activeTabId, patch);
      }
    },
    persistWorkspace: () => fileController.persistWorkspace(),
    scheduleLink: (delay) => analysisController.scheduleLink(delay),
    scheduleDiagramUpdate: () => analysisController.scheduleDiagramUpdate(),
    deferEditorLayout: () => void tick().then(() => monacoSession.layout()),
    schedule: (task, delay) => window.setTimeout(task, delay),
    cancel: (handle) => window.clearTimeout(handle)
  });
  const messageController = createMessageController({
    readMessages: () => systemMessages,
    writeMessages: (messages) => {
      systemMessages = messages;
    },
    sourceLabel: (sourceIdentity) => sourceIdentity.startsWith('__unsaved__/')
      ? tabs.find((tab) => tab.sourceIdentity === sourceIdentity)?.title ?? sourceIdentity
      : sourceIdentity,
    now: () => Date.now(),
    randomId: () => Math.random().toString(36).slice(2)
  });
  const layoutController = createLayoutController({
    readState: () => projectUi,
    writeState: (state) => {
      projectUi = state;
    },
    persistWorkspace: () => fileController.persistWorkspace(),
    deferEditorLayout: () => void tick().then(() => monacoSession.layout()),
    addPointerMove: (listener) => window.addEventListener('pointermove', listener),
    removePointerMove: (listener) => window.removeEventListener('pointermove', listener),
    addPointerUp: (listener) => window.addEventListener('pointerup', listener),
    removePointerUp: (listener) => window.removeEventListener('pointerup', listener)
  });
  monacoSession = createMonacoSession({
    editorHost: () => editorHost,
    tabs: () => tabs,
    activeTab: () => activeTab,
    activeTabId: () => activeTabId,
    editorTabId: () => editorTabId,
    selectEditorTab: (id) => tabController.selectEditor(id),
    editorSymbols: () => editorSymbols,
    completionSnapshot: () => workspaceCompletionSnapshot,
    diagnosticsFor: (tab) => analysisController.diagnosticsFor(tab),
    contentChanged: (tab, content) => fileController.contentChanged(tab, content)
  });
  analysisRunner = createAnalysisRunner({
    state: () => ({
      projectId,
      surface,
      tabs,
      activeTab,
      overlays,
      query: activeQuery,
      diagramMode: activeDiagramMode,
      deploymentEnvironment: activeDeploymentEnvironment
    }),
    linkProject,
    renderInBrowser: renderDotInBrowser,
    renderOnServer: renderProjectSvg,
    checkSyntax: (sources) => monacoSession.checkSyntax(sources),
    isCurrent: (sequence, requestedProjectId) => analysisController.isCurrentLink(sequence, requestedProjectId),
    updateLocalDiagnostics: (sources, diagnostics) => analysisController.updateLocalDiagnostics(sources, diagnostics),
    updateLinkerDiagnostics: (diagnostics, sources) => analysisController.updateLinkerDiagnostics(diagnostics, sources),
    setLoading: (loading) => {
      analysisLoading = loading;
    },
    acceptProjectSymbols: (symbols) => {
      projectSymbols = symbols;
    },
    acceptLinkedAnalysis: (analysis) => {
      linkedAnalysis = analysis;
    },
    reconcileDeploymentEnvironment: (analysis) => diagramController.reconcileDeploymentEnvironment(analysis),
    refreshEditorSymbols,
    acceptProjectStructure: acceptProjectStructureSnapshot,
    clearDots: (sourceIdentities) => tabController.clearDots(sourceIdentities),
    acceptDiagram: (sourceIdentity, svg, dot) => {
      tabController.patchBySourceIdentity(sourceIdentity, { svg, dot });
    },
    cycleSummary: (task, diagnostics) => messageController.cycleSummary(task, diagnostics),
    queryError: (message, query) => messageController.queryError(message, query),
    error: (message) => messageController.error(message),
    redirectIfAuthRequired: authController.redirectIfAuthRequired,
    scheduleDiagramUpdate: () => analysisController.scheduleDiagramUpdate()
  });
  projectSession = createProjectSessionController({
    surface: () => surface,
    readState: () => ({
      registry: projectRegistry,
      activeProjectId,
      tree,
      projectSymbols,
      projectStructure,
      analysisLoading,
      overlays,
      publishedProjectId
    }),
    writeState: (state) => {
      projectRegistry = state.registry;
      activeProjectId = state.activeProjectId;
      tree = state.tree;
      projectSymbols = state.projectSymbols;
      projectStructure = state.projectStructure;
      analysisLoading = state.analysisLoading;
      overlays = state.overlays;
      publishedProjectId = state.publishedProjectId;
    },
    fetchProjects,
    fetchPublication: fetchPlaygroundPublication,
    fetchTree,
    readRegistry: readProjectRegistry,
    writeRegistry: writeProjectRegistry,
    readWorkspace,
    clearProjectStorage,
    clearLocalWorkspaceStorage,
    resetWorkspaceTools: () => {
      monacoSession.reset();
      tabController.reset();
      analysisController.reset();
      diagramController.reset();
      messageController.reset();
    },
    refreshEditorSymbols,
    setProjectUi: (ui) => {
      projectUi = ui;
    },
    normalizeProjectUi,
    restoreFileTab: (tab, guard) => fileController.openFile(tab.filePath!, false, false, tab, undefined, guard),
    restoreLocalTab: (tab) => fileController.restoreLocalTab(tab),
    tabs: () => tabs,
    activateTab: (tabId, guard) => fileController.activateTab(tabId, guard),
    scheduleLink: (delay) => analysisController.scheduleLink(delay),
    defer: tick,
    redirectIfAuthRequired: authController.redirectIfAuthRequired,
    error: (message) => messageController.error(message)
  });
  fileController = createWorkspaceFileController({
    surface: () => surface,
    projectId: () => projectId,
    storageProjectId: () => storageProjectId,
    activeProjectId: () => activeProjectId,
    tabs: () => tabs,
    activeTab: () => activeTab,
    activeTabId: () => activeTabId,
    overlays: () => overlays,
    setOverlays: (next) => {
      overlays = next;
    },
    projectUi: () => projectUi,
    tree: () => tree,
    setTree: (next) => {
      tree = next;
    },
    tabController,
    monacoSession: () => monacoSession,
    analysisController: () => analysisController,
    fetchFile,
    saveFile,
    fetchTree,
    readLocalSource,
    hasLocalSource,
    writeLocalSource,
    removeLocalSource,
    writeWorkspace,
    authorizeNewTab: () => actionController.require('workspace.tab.create', actionController.newTabState()),
    authorizeSave: () => actionController.require('repository.file.save', actionController.saveState()),
    openFileDialog: repositoryDialogController.openFileDialog,
    coreSource: (sourceIdentity) => coreSourceByName.get(sourceIdentity) ?? coreSource,
    coreSourceExists: (sourceIdentity) => coreSourceByName.has(sourceIdentity),
    coreSourceIdentity: () => coreSourceIdentity,
    readonlyCoreTabId,
    currentProjectLoad: (guard) => projectSession.currentProjectLoad(guard),
    setDeploymentPickerOpen: (open) => {
      deploymentPickerOpen = open;
    },
    refreshEditorTokenVocabulary,
    defer: tick,
    redirectIfAuthRequired: authController.redirectIfAuthRequired,
    info: (message) => messageController.info(message),
    error: (message) => messageController.error(message),
    fileSaved: (path) => messageController.fileSaved(path)
  });
  actionController = createWorkspaceActionController({
    surface: () => surface,
    capabilities: () => capabilities,
    projects: () => projectRegistry.projects,
    activeProjectId: () => activeProjectId,
    activeTab: () => activeTab,
    info: (message) => messageController.info(message),
    newFile: () => fileController.newFile(),
    saveActiveTab: () => fileController.saveActiveTab(),
    openProjectDialog: (create) => projectDialogController.open(create)
  });
  const downloadController = createDownloadController({
    activeTab: () => activeTab,
    canDownloadDiagram: () => canDownloadCurrentDiagram,
    sanitizeSvg,
    svgToPngBlob,
    downloadText,
    downloadBlob,
    error: (message) => messageController.error(message)
  });

  let tree: TreeNode | undefined;
  let projectSymbols: LanguageSnapshot = emptyProjectSymbols();
  let projectStructure: ProjectStructure | undefined;
  let linkedAnalysis: LinkProjectResult | undefined;
  let projectRegistry: ProjectRegistryState = { projects: [] };
  let activeProjectId: string | undefined;
  let workspaceCompletionSnapshot: WorkspaceCompletionSnapshot = emptyWorkspaceCompletionSnapshot;
  let workspaceCompletionSnapshotRevision = 0;
  let editorSymbols: LanguageSnapshot = coreLanguageSnapshot;
  let tabs: WorkspaceTab[] = [];
  let activeTabId: string | undefined;
  let editorHost: HTMLDivElement;
  let editorTabId: string | undefined;
  let analysisLoading = false;
  let refreshDisabled = false;
  let localDiagnostics: Record<string, Diagnostic[]> = {};
  let linkerDiagnostics: Record<string, Diagnostic[]> = {};
  let overlays: Record<string, string> = {};
  let projectUi: ProjectUiState = defaultProjectUi();
  let systemMessages: MessageView[] = [];
  let messagesPanel: HTMLElement;
  let lastAutoScrolledMessagesSignature = '';
  let diagramVisibleScale = defaultDiagramScale;
  let diagramVisibleScaleTabId: string | undefined;
  let repositoryMenu: { node: TreeNode; x: number; y: number } | undefined;
  let fileDialog: FileDialogState | undefined;
  let deleteDialog: DeleteDialogState | undefined;
  let projectDialog: ProjectDialogState | undefined;
  let currentUser: AuthUserResponse = { authenticated: false };
  let capabilities: AppCapability[] = [];
  let publishedProjectId: string | undefined;
  let deploymentPickerOpen = false;
  let emptyStrategy: ReturnType<WorkspaceActionController['emptyStrategy']>;
  let newTabState: ReturnType<WorkspaceActionController['newTabState']>;
  let saveState: ReturnType<WorkspaceActionController['saveState']>;
  let repositoryMenuActions: ReturnType<WorkspaceActionController['repositoryStates']>;
  let publicationFormState: ReturnType<WorkspaceActionController['publicationState']>;

  $: activeTab = tabs.find((tab) => tab.id === activeTabId);
  $: projectId = activeProjectId ?? '';
  $: storageProjectId = projectSession.storageProjectId(projectId);
  $: activeFilePath = activeTab?.filePath;
  $: activeDiagramMode = activeTab?.diagramMode ?? defaultDiagramMode;
  $: activeQuery = activeTab?.query ?? defaultQuery;
  $: activeDeploymentEnvironment = activeTab?.deploymentEnvironment;
  $: activeDeploymentEnvironments = diagramController.deploymentEnvironmentsFor(activeTab, linkedAnalysis);
  $: activeQueryVisible = activeTab?.queryVisible ?? false;
  $: activeQueryPanelHeight = activeTab?.queryPanelHeight ?? defaultQueryPanelHeight;
  $: activeDiagramScale = activeTab?.diagramScale ?? defaultDiagramScale;
  $: activeDiagramFit = activeTab?.diagramFit ?? false;
  $: activeViewMode = activeTab?.viewMode ?? defaultViewMode;
  $: activeEditorSplitRatio = activeTab?.editorSplitRatio ?? defaultEditorSplitRatio;
  $: capabilities = currentUser.capabilities ?? [];
  $: {
    void surface;
    void capabilities;
    void projectRegistry;
    void activeProjectId;
    void activeTab;
    emptyStrategy = actionController.emptyStrategy();
    newTabState = actionController.newTabState();
    saveState = actionController.saveState();
    repositoryMenuActions = actionController.repositoryStates();
    publicationFormState = actionController.publicationState();
  }
  $: repositoryDirectoryOptions = repositoryDirectories(tree);
  $: openRepositoryFilePaths = tabs.flatMap((tab) => tab.filePath === undefined ? [] : [tab.filePath]);
  $: tabsRightPadding = surface === 'playground'
    ? currentUser.authenticated ? 120 : 190
    : 44;
  $: errorSourceIdentities = diagnosticErrorSources(localDiagnostics, linkerDiagnostics);
  $: workspaceHasErrors = diagnosticsHaveErrors(localDiagnostics) || diagnosticsHaveErrors(linkerDiagnostics);
  $: canDownloadCurrentDiagram = activeTab !== undefined
    && activeTab.dot !== undefined
    && activeTab.svg.trim().length > 0
    && !workspaceHasErrors;
  $: canDownloadCurrentDot = activeTab?.dot !== undefined;
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
    monacoSession.startLanguageWorker();
    if (!await authController.authorizeWorkspace()) return;
    try {
      await monacoSession.setupEditor();
      await projectSession.loadProjects();
      if (surface === 'editor' && capabilities.includes('publication:manage')) {
        await projectSession.loadPublication();
      }
      if (activeProjectId !== undefined) {
        await projectSession.loadProject();
      }
    } catch (error) {
      if (authController.redirectIfAuthRequired(error)) {
        return;
      }
      messageController.error(`Startup error: ${errorMessage(error)}`);
    }
    window.addEventListener('keydown', actionController.handleGlobalKeydown);
    window.addEventListener('click', closeRepositoryMenu);
  });

  onDestroy(() => {
    analysisController.dispose();
    diagramController.dispose();
    layoutController.dispose();
    window.removeEventListener('keydown', actionController.handleGlobalKeydown);
    window.removeEventListener('click', closeRepositoryMenu);
    monacoSession.dispose();
    terminateBrowserGraphvizWorker();
  });

  function closeRepositoryMenu(): void {
    repositoryMenu = undefined;
  }

  function refreshDiagnostics(): void {
    tabController.replaceDiagnostics((sourceIdentity) => analysisController.diagnosticsFor({ sourceIdentity }));
    monacoSession.refreshMarkers();
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
    monacoSession.refreshTokenVocabulary(options);
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

</script>

<main class="workspace" style={workspaceStyle}>
  <ProjectNavigationPanel
    {tree}
    hasActiveProject={activeProjectId !== undefined}
    symbols={editorSymbols}
    structure={projectStructure}
    structureLoading={analysisLoading}
    activePath={activeFilePath}
    errorPaths={errorSourceIdentities}
    ui={projectUi}
    visible={sidebarVisible}
    onOpen={(path) => void fileController.openFile(path)}
    onRepositoryContextMenu={openRepositoryMenu}
    onOpenDeclaration={(declaration) => void fileController.goToDeclaration(declaration)}
    onShowSidebar={layoutController.showSidebar}
    onToggleSidebar={layoutController.toggleSidebar}
    onToggleMessages={layoutController.toggleMessages}
    onBeginSidebarResize={layoutController.beginSidebarResize}
  />

  <section class="main">
    <div class="auth-menu-host">
      {#if surface === 'editor'}
        <AuthMenu
          user={currentUser}
          onLogin={authController.login}
          onManageProjects={actionController.manageProjects}
          onLogout={() => void authController.logout()}
        />
      {:else}
        <nav class="playground-auth" aria-label="Account">
          {#if currentUser.authenticated}
            <a class="go-to-editor" href={routePath('/editor')}>Switch to Editor</a>
          {:else}
            <a href={routePath('/login')}>Sign In</a>
            <a class="sign-up" href={routePath('/login')}>Sign Up</a>
          {/if}
        </nav>
      {/if}
    </div>
    <WorkspaceTabs
      {tabs}
      {activeTabId}
      {errorSourceIdentities}
      rightPadding={tabsRightPadding}
      onActivate={(tabId) => void fileController.activateTab(tabId)}
      onClose={fileController.closeTab}
    />

    <WorkspaceEditor
      active={activeTab !== undefined}
      svg={activeTab?.svg}
      diagramMode={activeDiagramMode}
      query={activeQuery}
      deploymentEnvironments={activeDeploymentEnvironments}
      deploymentEnvironment={activeDeploymentEnvironment}
      {deploymentPickerOpen}
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
      onEmptyAction={actionController.handleEmptyAction}
      onSelectDiagramMode={diagramController.selectMode}
      onSelectDeploymentEnvironment={diagramController.selectDeploymentEnvironment}
      onCloseDeploymentPicker={diagramController.closeDeploymentPicker}
      onToggleQuery={diagramController.toggleQuery}
      onQueryChange={diagramController.updateQuery}
      onQueryPanelHeightChange={diagramController.updateQueryPanelHeight}
      onZoomIn={() => diagramController.zoom(0.06)}
      onZoomOut={() => diagramController.zoom(-0.06)}
      onFitDiagram={diagramController.fit}
      onActualSize={diagramController.actualSize}
      onSelectViewMode={diagramController.selectViewMode}
      onRefresh={diagramController.refresh}
      onEditorSplitRatioChange={diagramController.updateEditorSplitRatio}
      onDiagramVisibleScaleChange={diagramController.updateVisibleScale}
      onOpenDeclaration={fileController.goToDeclaration}
      onBeginMessagesResize={layoutController.beginMessagesResize}
    >
      <WorkspaceToolbar
        slot="leading-actions"
        onNewFile={() => void fileController.newFile()}
        onSave={() => void fileController.saveActiveTab()}
        onDownloadSource={downloadController.source}
        onDownloadSvg={downloadController.svg}
        onDownloadPng={() => void downloadController.png()}
        onDownloadDot={downloadController.dot}
        canDownloadSvg={canDownloadCurrentDiagram}
        canDownloadPng={canDownloadCurrentDiagram}
        canDownloadDot={canDownloadCurrentDot}
        newFileState={newTabState}
        {saveState}
      />
    </WorkspaceEditor>
  </section>
</main>

{#if repositoryMenu !== undefined}
  <RepositoryContextMenu
    menu={repositoryMenu}
    actions={repositoryMenuActions}
    onClose={closeRepositoryMenu}
    onNewFile={repositoryDialogController.newFile}
    onNewFolder={repositoryDialogController.newFolder}
    onRenameFile={repositoryDialogController.renameFile}
    onRenameFolder={repositoryDialogController.renameFolder}
    onDeleteFile={repositoryDialogController.deleteFile}
    onDeleteFolder={repositoryDialogController.deleteFolder}
  />
{/if}

{#if projectDialog !== undefined}
  <ProjectDialog
    view={{
      dialog: projectDialog,
      projects: projectRegistry.projects,
      activeProjectId,
      publishedProjectId,
      publicationState: publicationFormState
    }}
    onIntent={projectDialogController.handle}
  />
{/if}

{#if deleteDialog !== undefined}
  <RepositoryDeleteDialog
    dialog={deleteDialog}
    onCancel={repositoryDialogController.closeDeleteDialog}
    onSubmit={() => void repositoryDialogController.confirmDeleteDialog()}
  />
{/if}

{#if fileDialog !== undefined}
  <RepositoryFileDialog
    dialog={fileDialog}
    directories={repositoryDirectoryOptions}
    onCancel={repositoryDialogController.closeFileDialog}
    onSubmit={() => void repositoryDialogController.confirmFileDialog()}
    onDirectoryChange={repositoryDialogController.updateDirectory}
    onFileNameChange={repositoryDialogController.updateFileName}
  />
{/if}

<style>
  .workspace {
    display: grid;
    width: 100vw;
    height: 100vh;
    background: #252525;
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
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .playground-auth {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .playground-auth a {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 4px;
    color: #dddddd;
    font-size: 12px;
    text-decoration: none;
  }

  .playground-auth a:hover,
  .playground-auth a:focus-visible {
    background: #343434;
    color: #ffffff;
    outline: none;
  }

  .playground-auth .sign-up,
  .playground-auth .go-to-editor {
    border-color: #bdbdbd;
  }

  @media (max-width: 980px) {
    .workspace {
      grid-template-columns: 240px 1fr;
    }
  }
</style>
