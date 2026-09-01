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
  import { emptyWorkspaceStrategy, type EmptyWorkspaceAction } from '$lib/empty-workspace-strategy';
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
    AuthRequiredError,
    type AuthUserResponse,
    type Diagnostic,
    type ProjectStructure
  } from '$lib/api';
  import {
    canExecute,
    controlState,
    type ActionId,
    type WorkspaceSurface
  } from '$lib/actions/action-model';
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
    writeWorkspace,
    type WorkspaceTabState,
    type ProjectSummary
  } from '$lib/storage';
  import {
    diagnosticErrorSources,
    diagnosticsHaveErrors
  } from '$lib/workspace/analysis/diagnostics';
  import { createAnalysisController, type AnalysisController } from '$lib/workspace/analysis/analysis-controller';
  import { createAnalysisRunner, type AnalysisRunner } from '$lib/workspace/analysis/analysis-runner';
  import { createDiagramController, emptyDiagramSvg } from '$lib/workspace/diagram/diagram-controller';
  import {
    downloadBlob,
    downloadText,
    fileNameWithExtension,
    svgToPngBlob
  } from '$lib/workspace/diagram/download';
  import { createTabController } from '$lib/workspace/editor/tab-controller';
  import { createMonacoSession, type MonacoSession } from '$lib/workspace/editor/monaco-session';
  import {
    isProjectSourceTab,
    tabToolbarState,
    virtualSourceIdentity,
    workspaceTabState
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
    createRepositoryController,
    type RepositoryFileEffect
  } from '$lib/workspace/repository/repository-controller';
  import { createRepositoryDialogController } from '$lib/workspace/repository/repository-dialog-controller';
  import {
    baseName,
    defaultDialogFileName as repositoryDefaultDialogFileName,
    replaceDirectoryPrefix
  } from '$lib/workspace/repository/repository-paths';
  import RepositoryDeleteDialog from '$lib/workspace/repository/RepositoryDeleteDialog.svelte';
  import RepositoryContextMenu from '$lib/workspace/repository/RepositoryContextMenu.svelte';
  import RepositoryFileDialog from '$lib/workspace/repository/RepositoryFileDialog.svelte';
  import type {
    DeleteDialogState,
    FileDialogState
  } from '$lib/workspace/repository/repository-dialog-types';
  import {
    repositoryDirectories,
    repositoryFilePathsInDirectory
  } from '$lib/workspace/repository/repository-tree';
  import { createLayoutController } from '$lib/workspace/shell/layout-controller';
  import {
    clamp,
    collapsedSidebarWidth,
    defaultProjectUi,
    minMessagesHeight,
    minSidebarWidth,
    normalizeProjectUi
  } from '$lib/workspace/shell/layout-model';
  import type { MessageView, ProjectUiState, SourceLocation, TreeNode, WorkspaceTab } from '$lib/workspace-types';

  const defaultViewMode = 'split' as const;
  const defaultDiagramScale = 1;
  const defaultEditorSplitRatio = 50;
  const defaultQueryPanelHeight = 118;
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
  type DiagramQueryState = Pick<WorkspaceTab, 'diagramMode' | 'query' | 'queryPreset'>;

  type ProjectLoadGuard = {
    projectId: string;
    storageProjectId: string;
    generation: number;
  };

  function readonlyCoreTabId(sourceIdentity: string): string {
    return `__readonly__/${sourceIdentity}`;
  }

  export let surface: WorkspaceSurface = 'editor';

  let analysisController!: AnalysisController;
  let analysisRunner!: AnalysisRunner;
  let monacoSession!: MonacoSession;

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
    authorize: authorizeRepositoryAction,
    projectId: () => projectId,
    tree: () => tree,
    openFilePaths: () => openRepositoryFilePaths,
    commands: repositoryController,
    acceptDeletedFiles,
    acceptFileEffect,
    refreshProjectMetadata,
    persistWorkspace,
    scheduleLink: () => analysisController.scheduleLink(),
    redirectIfAuthRequired
  });
  const projectController = createProjectController({
    acceptCreatedProject,
    acceptUpdatedProject,
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
    publicationAllowed: () => canExecute(publicationFormState),
    commands: projectController,
    switchProject,
    acceptDeletedProject,
    redirectIfAuthRequired
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
    persistWorkspace,
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
    persistWorkspace,
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
    contentChanged: (tab, content) => {
      tabController.patch(tab.id, { content, local: true, dot: undefined });
      if (tab.filePath !== undefined) {
        overlays = { ...overlays, [tab.filePath]: content };
        writeLocalSource(storageProjectId, tab.filePath, content);
      }
      analysisController.scheduleLink();
      persistWorkspace();
      refreshEditorTokenVocabulary({ repaint: false });
      analysisController.scheduleLiveSyntaxCheck([{ sourceIdentity: tab.sourceIdentity, content }]);
    }
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
    redirectIfAuthRequired,
    scheduleDiagramUpdate: () => analysisController.scheduleDiagramUpdate()
  });

  let tree: TreeNode | undefined;
  let projectSymbols: LanguageSnapshot = emptySymbols;
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
  let untitledCounter = 1;
  let projectGeneration = 0;
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

  $: activeTab = tabs.find((tab) => tab.id === activeTabId);
  $: projectId = activeProjectId ?? '';
  $: storageProjectId = surface === 'playground' ? `playground:${projectId}` : projectId;
  $: emptyStrategy = controlledEmptyStrategy(surface, capabilities);
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
  $: activeReadOnly = activeTab?.readOnly === true;
  $: capabilities = currentUser.capabilities ?? [];
  $: newTabState = actionState('workspace.tab.create', true, 'Action is unavailable', surface, capabilities);
  $: createFileState = actionState('repository.file.create', activeProjectId !== undefined, 'No active project', surface, capabilities);
  $: saveState = actionState('repository.file.save', activeTab !== undefined && !activeReadOnly, activeReadOnly ? 'File is read-only' : 'No active file', surface, capabilities);
  $: createFolderState = actionState('repository.folder.create', activeProjectId !== undefined, 'No active project', surface, capabilities);
  $: renameFileState = actionState('repository.file.rename', activeProjectId !== undefined, 'No active project', surface, capabilities);
  $: renameFolderState = actionState('repository.folder.rename', activeProjectId !== undefined, 'No active project', surface, capabilities);
  $: deleteFileState = actionState('repository.file.delete', activeProjectId !== undefined, 'No active project', surface, capabilities);
  $: deleteFolderState = actionState('repository.folder.delete', activeProjectId !== undefined, 'No active project', surface, capabilities);
  $: repositoryMenuActions = {
    createFile: createFileState,
    createFolder: createFolderState,
    renameFile: renameFileState,
    renameFolder: renameFolderState,
    deleteFile: deleteFileState,
    deleteFolder: deleteFolderState
  };
  $: repositoryDirectoryOptions = repositoryDirectories(tree);
  $: openRepositoryFilePaths = tabs.flatMap((tab) => tab.filePath === undefined ? [] : [tab.filePath]);
  $: publicationFormState = controlState('publication.toggle', { surface, capabilities });
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
    if (surface === 'editor') {
      const userLoaded = await refreshCurrentUser();
      if (!userLoaded) {
        return;
      }
      if (!currentUser.authenticated) {
        window.location.href = loginRoute();
        return;
      }
    } else {
      await refreshCurrentUser();
    }
    try {
      await monacoSession.setupEditor();
      await loadProjects();
      if (surface === 'editor' && capabilities.includes('publication:manage')) {
        await loadPublication();
      }
      if (activeProjectId !== undefined) {
        await loadProject();
      }
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      messageController.error(`Startup error: ${errorMessage(error)}`);
    }
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('click', closeRepositoryMenu);
  });

  onDestroy(() => {
    analysisController.dispose();
    diagramController.dispose();
    layoutController.dispose();
    window.removeEventListener('keydown', handleGlobalKeydown);
    window.removeEventListener('click', closeRepositoryMenu);
    monacoSession.dispose();
    terminateBrowserGraphvizWorker();
  });

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (canExecute(saveState)) {
        void saveActiveTab();
      }
    }
  }

  function closeRepositoryMenu(): void {
    repositoryMenu = undefined;
  }

  function handleEmptyWorkspaceAction(action: EmptyWorkspaceAction): void {
    switch (action.id) {
      case 'create-tab':
        if (canExecute(newTabState)) {
          void newFile();
        }
        return;
      case 'create-project':
        if (!requireAction('repository.project.create')) {
          return;
        }
        projectDialogController.open(true);
        return;
      case 'manage-projects':
        if (!requireAction('repository.project.manage')) {
          return;
        }
        projectDialogController.open(false);
        return;
    }
  }

  function acceptCreatedProject(project: ProjectSummary): void {
    projectRegistry = { projects: [project, ...projectRegistry.projects], activeProjectId };
  }

  function acceptUpdatedProject(project: ProjectSummary): void {
    projectRegistry = {
      ...projectRegistry,
      projects: projectRegistry.projects.map((item) => item.id === project.id ? project : item)
    };
    writeProjectRegistry(projectRegistry);
    if (tree !== undefined && project.id === activeProjectId) {
      tree = { ...tree, name: project.name };
    }
  }

  async function acceptDeletedProject(targetId: string): Promise<number> {
    clearProjectStorage(targetId);
    const projects = projectRegistry.projects.filter((item) => item.id !== targetId);
    projectRegistry = { projects, activeProjectId };
    if (activeProjectId === targetId) {
      const nextId = projects[0]?.id;
      if (nextId !== undefined) {
        await switchProject(nextId);
      } else {
        resetWorkspaceState();
        activeProjectId = undefined;
        projectRegistry = { projects: [] };
        writeProjectRegistry(projectRegistry);
        refreshEditorSymbols();
      }
    } else {
      writeProjectRegistry(projectRegistry);
    }
    return projects.length;
  }

  async function switchProject(nextProjectId: string): Promise<void> {
    if (nextProjectId === activeProjectId) {
      return;
    }
    resetWorkspaceState();
    clearLocalWorkspaceStorage();
    activeProjectId = nextProjectId;
    projectRegistry = { ...projectRegistry, activeProjectId: nextProjectId };
    writeProjectRegistry(projectRegistry);
    await tick();
    await loadProject();
  }

  function resetWorkspaceState(): void {
    projectGeneration += 1;
    monacoSession.reset();
    tabController.reset();
    analysisController.reset();
    diagramController.reset();
    messageController.reset();
    tree = undefined;
    projectSymbols = emptySymbols;
    projectStructure = undefined;
    analysisLoading = false;
    overlays = {};
  }

  function controlledEmptyStrategy(actionSurface: WorkspaceSurface, actionCapabilities: readonly AppCapability[]) {
    const strategy = emptyWorkspaceStrategy(projectRegistry.projects, activeProjectId);
    return {
      ...strategy,
      actions: strategy.actions.flatMap((action) => {
        const actionId: ActionId = action.id === 'create-tab'
          ? 'workspace.tab.create'
          : action.id === 'create-project'
          ? 'repository.project.create'
          : action.id === 'manage-projects'
            ? 'repository.project.manage'
            : 'repository.file.create';
        const state = actionState(actionId, true, 'Action is unavailable', actionSurface, actionCapabilities);
        return state.hidden
          ? []
          : [{ ...action, disabled: state.disabled, reason: state.reason }];
      })
    };
  }

  function actionState(
    actionId: ActionId,
    available = true,
    unavailableReason = 'Action is unavailable',
    actionSurface = surface,
    actionCapabilities: readonly AppCapability[] = capabilities
  ) {
    return controlState(actionId, {
      surface: actionSurface,
      capabilities: actionCapabilities,
      available,
      unavailableReason
    });
  }

  function requireAction(actionId: ActionId, state = actionState(actionId)): boolean {
    if (canExecute(state)) {
      return true;
    }
    messageController.info(state.reason ?? 'Action is unavailable');
    return false;
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
      messageController.error(`Auth error: ${errorMessage(error)}`);
      return true;
    }
  }

  function login(): void {
    window.location.href = loginRoute();
  }

  function manageProjects(): void {
    if (requireAction('repository.project.manage')) {
      projectDialogController.open(false);
    }
  }

  async function logout(): Promise<void> {
    try {
      await logoutCurrentUser();
      clearLocalWorkspaceStorage();
      currentUser = { authenticated: false };
      window.location.href = '/';
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      messageController.error(`Logout failed: ${errorMessage(error)}`);
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

  async function loadProjects(): Promise<void> {
    const response = await fetchProjects(surface);
    const projects = response.projects;
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
      analysisLoading = false;
      tabController.reset();
      analysisController.reset();
      overlays = {};
      refreshEditorSymbols();
    }
  }

  async function loadPublication(): Promise<void> {
    const publication = await fetchPlaygroundPublication();
    publishedProjectId = publication?.repositoryId;
  }

  async function loadProject(): Promise<void> {
    if (activeProjectId === undefined) {
      return;
    }
    const loadingProjectId = projectId;
    const generation = ++projectGeneration;
    analysisLoading = true;
    try {
      const treeResponse = await fetchTree(loadingProjectId, surface);
      if (generation !== projectGeneration || loadingProjectId !== projectId) {
        return;
      }
      tree = treeResponse.root;
      const workspace = readWorkspace(storageProjectId);
      const loadGuard = { projectId: loadingProjectId, storageProjectId, generation };
      projectUi = normalizeProjectUi(workspace.ui, workspace.tabs);
      for (const tab of workspace.tabs) {
        if (!currentProjectLoad(loadGuard)) {
          return;
        }
        if (tab.filePath !== undefined) {
          await openFile(tab.filePath, false, false, tab, undefined, loadGuard);
        } else {
          restoreLocalTab(tab);
        }
      }
      if (!currentProjectLoad(loadGuard)) {
        return;
      }
      if (workspace.activeTab !== undefined && tabs.some((tab) => tab.id === workspace.activeTab)) {
        await activateTab(workspace.activeTab, loadGuard);
      } else if (tabs[0] !== undefined) {
        await activateTab(tabs[0].id, loadGuard);
      }
      if (!currentProjectLoad(loadGuard)) {
        return;
      }
      analysisController.scheduleLink(0);
    } catch (error) {
      if (generation === projectGeneration) {
        analysisLoading = false;
      }
      if (redirectIfAuthRequired(error)) {
        return;
      }
      messageController.error(`Server error: ${errorMessage(error)}`);
    }
  }

  async function openFile(
    path: string,
    activate = true,
    render = true,
    restored?: WorkspaceTabState,
    queryState?: DiagramQueryState,
    loadGuard?: ProjectLoadGuard
  ): Promise<void> {
    if (loadGuard !== undefined && !currentProjectLoad(loadGuard)) {
      return;
    }
    const existing = tabs.find((tab) => tab.filePath === path);
    if (existing !== undefined) {
      applyInheritedQuery(existing.id, queryState);
      if (activate) {
        await activateTab(path);
      }
      return;
    }

    const targetProjectId = loadGuard?.projectId ?? projectId;
    const targetStorageProjectId = loadGuard?.storageProjectId ?? storageProjectId;
    const localContent = readLocalSource(targetStorageProjectId, path);
    let content: string;
    try {
      content = localContent ?? (await fetchFile(targetProjectId, path, surface)).content;
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      messageController.error(`Server error: ${errorMessage(error)}`);
      return;
    }
    if (loadGuard !== undefined && !currentProjectLoad(loadGuard)) {
      return;
    }
    if (hasLocalSource(targetStorageProjectId, path)) {
      overlays = { ...overlays, [path]: content };
    }
    monacoSession.ensureModel(path, content);
    tabController.append({
      title: path.split('/').at(-1) ?? path,
      content,
      svg: emptyDiagramSvg('Render is waiting for a valid model'),
      id: path,
      filePath: path,
      sourceIdentity: path,
      diagnostics: [],
      local: localContent !== undefined,
      ...tabToolbarState({ ...restored, ...queryState })
    });
    refreshEditorTokenVocabulary();
    persistWorkspace();
    if (activate) {
      await activateTab(path);
    }
    if (render) {
      analysisController.scheduleLiveSyntaxCheck([{ sourceIdentity: path, content }]);
      if (localContent === undefined) {
        analysisController.scheduleDiagramUpdate();
      } else {
        analysisController.scheduleLink();
      }
    }
  }

  function currentProjectLoad(guard: ProjectLoadGuard): boolean {
    return guard.generation === projectGeneration && guard.projectId === projectId;
  }

  async function goToDeclaration(declaration: SourceLocation): Promise<void> {
    const queryState = currentDiagramQueryState();
    if (coreSourceByName.has(declaration.source)) {
      await openCoreSource(declaration.source, queryState);
    } else {
      await openFile(declaration.source, true, true, undefined, queryState);
    }
    await tick();
    monacoSession.reveal(declaration);
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
    monacoSession.ensureModel(tabId, source);
    tabController.append({
      title: sourceIdentity,
      content: source,
      svg: emptyDiagramSvg('Core framework source is read-only'),
      id: tabId,
      sourceIdentity,
      diagnostics: [],
      local: false,
      readOnly: true,
      projectSource: false,
      ...tabToolbarState(queryState)
    });
    refreshEditorTokenVocabulary();
    await activateTab(tabId);
  }

  function currentDiagramQueryState(): DiagramQueryState | undefined {
    if (activeTab === undefined) {
      return undefined;
    }
    return {
      diagramMode: activeDiagramMode,
      query: activeQuery,
      queryPreset: activeTab.queryPreset
    };
  }

  function applyInheritedQuery(tabId: string, queryState: DiagramQueryState | undefined): void {
    if (queryState === undefined) {
      return;
    }
    const next = tabToolbarState(queryState);
    tabController.patch(tabId, {
      diagramMode: next.diagramMode,
      query: next.query,
      queryPreset: next.queryPreset,
      dot: undefined
    });
    persistWorkspace();
  }

  async function newFile(): Promise<void> {
    if (!requireAction('workspace.tab.create', newTabState)) {
      return;
    }
    const id = `untitled:${untitledCounter++}`;
    const sourceIdentity = virtualSourceIdentity(id);
    tabController.append({
      id,
      sourceIdentity,
      title: `Untitled ${untitledCounter - 1}`,
      content: '',
      svg: emptyDiagramSvg('Unsaved file is not part of the project yet'),
      diagnostics: [],
      local: true,
      ...tabToolbarState()
    });
    refreshEditorTokenVocabulary();
    persistWorkspace();
    await activateTab(id);
  }

  function restoreLocalTab(tab: WorkspaceTabState): void {
    const id = tabController.uniqueId(tab.id);
    const sourceIdentity = tab.sourceIdentity ?? virtualSourceIdentity(id);
    monacoSession.ensureModel(id, tab.content ?? '');
    tabController.append({
      id,
      sourceIdentity,
      title: tab.title,
      content: tab.content ?? '',
      svg: emptyDiagramSvg('Unsaved file is not part of the project yet'),
      diagnostics: [],
      local: true,
      ...tabToolbarState(tab)
    });
    bumpUntitledCounter(id, tab.title);
    refreshEditorTokenVocabulary();
    analysisController.scheduleLiveSyntaxCheck([{ sourceIdentity, content: tab.content ?? '' }]);
  }

  async function activateTab(id: string, loadGuard?: ProjectLoadGuard): Promise<void> {
    if (loadGuard !== undefined && !currentProjectLoad(loadGuard)) {
      return;
    }
    tabController.activate(id);
    deploymentPickerOpen = false;
    persistWorkspace();
    await tick();
    if (loadGuard !== undefined && !currentProjectLoad(loadGuard)) {
      return;
    }
    monacoSession.syncActiveTab();
    analysisController.scheduleDiagramUpdate();
  }

  function closeTab(id: string): void {
    const tab = tabs.find((item) => item.id === id);
    const closingActiveTab = activeTabId === id;
    const removesSemanticInput = tab !== undefined
      && isProjectSourceTab(tab)
      && (tab.filePath === undefined || Object.hasOwn(overlays, tab.filePath));
    if (tab?.filePath !== undefined) {
      removeLocalSource(storageProjectId, tab.filePath);
      delete overlays[tab.filePath];
    }
    if (tab !== undefined) {
      analysisController.removeDiagnostics([tab.sourceIdentity]);
    }
    tabController.remove(id);
    monacoSession.removeModel(id);
    refreshEditorTokenVocabulary();
    if (closingActiveTab) {
      monacoSession.syncActiveTab();
      if (removesSemanticInput) {
        analysisController.scheduleLink();
      } else {
        analysisController.scheduleDiagramUpdate();
      }
    } else if (removesSemanticInput) {
      analysisController.scheduleLink();
    }
    persistWorkspace();
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

  function persistWorkspace(): void {
    if (activeProjectId === undefined) {
      return;
    }
    const persistentTabs = tabs.filter(isProjectSourceTab);
    writeWorkspace(storageProjectId, {
      tabs: persistentTabs.map(workspaceTabState),
      activeTab: activeTabId !== undefined && persistentTabs.some((tab) => tab.id === activeTabId) ? activeTabId : undefined,
      ui: projectUi
    });
  }

  async function saveActiveTab(): Promise<void> {
    if (!requireAction('repository.file.save', saveState)) {
      return;
    }
    const tab = activeTab;
    if (tab === undefined) {
      return;
    }
    if (tab.readOnly === true) {
      messageController.info(`${tab.title} is read-only`);
      return;
    }
    if (tab.filePath === undefined) {
      repositoryDialogController.openFileDialog({
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
    if (!requireAction('repository.file.save', saveState)) {
      return;
    }
    try {
      const result = await saveFile(projectId, path, { content: tab.content });
      removeLocalSource(storageProjectId, tab.filePath ?? path);
      removeLocalSource(storageProjectId, result.path);
      delete overlays[tab.filePath ?? path];
      delete overlays[result.path];
      if (tab.filePath === undefined || tab.filePath !== result.path) {
        retargetOpenTab(tab.id, result.path, tab.content, false);
      } else {
        tabController.patch(tab.id, { local: false });
      }
      await refreshProjectMetadata();
      persistWorkspace();
      analysisController.scheduleLink();
      messageController.fileSaved(result.path);
    } catch (error) {
      if (redirectIfAuthRequired(error)) {
        return;
      }
      messageController.error(`Server error: ${errorMessage(error)}`);
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
    const sanitized = sanitizeSvg(tab.svg);
    if (!sanitized) {
      messageController.error('Download failed: SVG content is invalid');
      return;
    }
    downloadText(fileNameWithExtension(tab.title, '.svg'), sanitized, 'image/svg+xml;charset=utf-8');
  }

  async function downloadActiveDiagramPng(): Promise<void> {
    const tab = activeTab;
    if (tab === undefined || !canDownloadCurrentDiagram) {
      return;
    }
    try {
      const sanitized = sanitizeSvg(tab.svg);
      if (!sanitized) {
        throw new Error('SVG content is invalid');
      }
      const blob = await svgToPngBlob(sanitized);
      downloadBlob(fileNameWithExtension(tab.title, '.png'), blob);
    } catch (error) {
      messageController.error(`Download failed: ${errorMessage(error)}`);
    }
  }

  function downloadActiveDiagramDot(): void {
    const tab = activeTab;
    if (tab?.dot === undefined) {
      return;
    }
    downloadText(fileNameWithExtension(tab.title, '.dot'), tab.dot, 'text/vnd.graphviz;charset=utf-8');
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

  function authorizeRepositoryAction(actionId: ActionId): boolean {
    switch (actionId) {
      case 'repository.file.create': return requireAction(actionId, createFileState);
      case 'repository.folder.create': return requireAction(actionId, createFolderState);
      case 'repository.file.rename': return requireAction(actionId, renameFileState);
      case 'repository.folder.rename': return requireAction(actionId, renameFolderState);
      case 'repository.file.delete': return requireAction(actionId, deleteFileState);
      case 'repository.folder.delete': return requireAction(actionId, deleteFolderState);
      case 'repository.file.save': return requireAction(actionId, saveState);
      default: return requireAction(actionId);
    }
  }

  async function acceptDeletedFiles(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      closeFileTab(path);
      removeLocalSource(storageProjectId, path);
      delete overlays[path];
    }
    analysisController.removeDiagnostics([...paths]);
    refreshEditorTokenVocabulary();
  }

  async function acceptFileEffect(effect: RepositoryFileEffect): Promise<void> {
    switch (effect.kind) {
      case 'file-renamed':
        retargetTabsForRename(effect.sourcePath, effect.path);
        return;
      case 'folder-renamed':
        retargetTabsForFolderRename(effect.sourcePath, effect.path);
        return;
      case 'file-saved':
        if (effect.tabId !== undefined) {
          retargetOpenTab(effect.tabId, effect.path, effect.content, false);
        } else {
          await openFile(effect.path);
        }
        messageController.fileSaved(effect.path);
        return;
      case 'folder-created':
        return;
    }
  }

  function retargetTabsForRename(sourcePath: string, targetPath: string): void {
    const tab = tabs.find((item) => item.filePath === sourcePath);
    if (tab === undefined) {
      removeLocalSource(storageProjectId, sourcePath);
      delete overlays[sourcePath];
      return;
    }
    retargetOpenTab(tab.id, targetPath, tab.content, tab.local);
    if (tab.local) {
      overlays[targetPath] = tab.content;
      writeLocalSource(storageProjectId, targetPath, tab.content);
    }
    removeLocalSource(storageProjectId, sourcePath);
    delete overlays[sourcePath];
  }

  function retargetTabsForFolderRename(sourcePath: string, targetPath: string): void {
    const files = repositoryFilePathsInDirectory(tree, sourcePath, openRepositoryFilePaths);
    for (const filePath of files) {
      const nextPath = replaceDirectoryPrefix(filePath, sourcePath, targetPath);
      retargetTabsForRename(filePath, nextPath);
    }
  }

  function retargetOpenTab(tabId: string, path: string, content: string, local: boolean): void {
    const transition = tabController.retarget(
      tabId,
      { path, title: baseName(path), content, local }
    );
    const tab = transition.previousTab;
    const targetId = transition.targetId;
    if (tab === undefined || targetId === undefined) {
      return;
    }
    monacoSession.retargetModel(tab.id, targetId);
    analysisController.removeDiagnostics([tab.sourceIdentity]);
    monacoSession.syncActiveTab();
    refreshEditorTokenVocabulary();
  }

  function closeFileTab(path: string): void {
    const tab = tabs.find((item) => item.filePath === path);
    if (tab !== undefined) {
      closeTab(tab.id);
    }
  }

  async function refreshProjectMetadata(): Promise<void> {
    const treeResponse = await fetchTree(projectId, surface);
    tree = treeResponse.root;
  }

  function defaultDialogFileName(title: string): string {
    return repositoryDefaultDialogFileName(title, defaultNewFileName);
  }

  function bumpUntitledCounter(id: string, title: string): void {
    const match = /^(?:untitled:|Untitled )(\d+)$/.exec(id) ?? /^(?:untitled:|Untitled )(\d+)$/.exec(title);
    if (match === null) {
      return;
    }
    untitledCounter = Math.max(untitledCounter, Number(match[1]) + 1);
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
    onOpen={(path) => void openFile(path)}
    onRepositoryContextMenu={openRepositoryMenu}
    onOpenDeclaration={(declaration) => void goToDeclaration(declaration)}
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
          onLogin={login}
          onManageProjects={manageProjects}
          onLogout={() => void logout()}
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
      onActivate={(tabId) => void activateTab(tabId)}
      onClose={closeTab}
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
      onEmptyAction={handleEmptyWorkspaceAction}
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
      onOpenDeclaration={goToDeclaration}
      onBeginMessagesResize={layoutController.beginMessagesResize}
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
