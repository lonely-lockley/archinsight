import { tick } from 'svelte';
import { defaultDiagramMode, defaultQuery } from '@archinsight/workbench/presets';
import { createAnalysisController, type AnalysisController } from '$lib/workspace/analysis/analysis-controller';
import { createAnalysisRunner, type AnalysisRunner } from '$lib/workspace/analysis/analysis-runner';
import { createAuthController, type AuthController } from '$lib/workspace/auth/auth-controller';
import { createDiagramController, type DiagramController } from '$lib/workspace/diagram/diagram-controller';
import { createDownloadController, type DownloadController } from '$lib/workspace/diagram/download-controller';
import { createMonacoSession, type MonacoSession } from '$lib/workspace/editor/monaco-session';
import { createTabController, type TabController } from '$lib/workspace/editor/tab-controller';
import { isProjectSourceTab } from '$lib/workspace/editor/tab-persistence';
import {
  createEditorSynchronization,
  workspaceCoreSources
} from '$lib/workspace/editor/workspace-editor-context';
import {
  createWorkspaceFileController,
  type WorkspaceFileController
} from '$lib/workspace/editor/workspace-file-controller';
import { createMessageController } from '$lib/workspace/messages/message-controller';
import { createProjectController } from '$lib/workspace/projects/project-controller';
import {
  createProjectDialogController,
  type ProjectDialogController
} from '$lib/workspace/projects/project-dialog-controller';
import {
  createProjectSessionController,
  type ProjectSessionController
} from '$lib/workspace/projects/project-session-controller';
import { createRepositoryController } from '$lib/workspace/repository/repository-controller';
import {
  createRepositoryDialogController,
  type RepositoryDialogController
} from '$lib/workspace/repository/repository-dialog-controller';
import { createLayoutController, type LayoutController } from '$lib/workspace/shell/layout-controller';
import { normalizeProjectUi } from '$lib/workspace/shell/layout-model';
import {
  createWorkspaceActionController,
  type WorkspaceActionController
} from '$lib/workspace/shell/workspace-action-controller';
import {
  activeWorkspaceTab,
  canDownloadWorkspaceDiagram
} from '$lib/workspace/shell/workspace-runtime-state';
import { createWorkspaceRuntimeLifecycle } from '$lib/workspace/shell/workspace-runtime-lifecycle';
import { workspaceRuntimeDependencies } from '$lib/workspace/shell/workspace-runtime-dependencies';
import type {
  WorkspaceRuntime,
  WorkspaceRuntimeHost
} from '$lib/workspace/shell/workspace-runtime-types';

export function createWorkspaceRuntime(host: WorkspaceRuntimeHost): WorkspaceRuntime {
  const { api, storage, diagram } = workspaceRuntimeDependencies;
  const state = host.state;
  const patch = host.patchState;
  const activeTab = () => activeWorkspaceTab(state());
  const projectId = () => state().activeProjectId ?? '';

  let analysisController!: AnalysisController;
  let analysisRunner!: AnalysisRunner;
  let monacoSession!: MonacoSession;
  let projectSession!: ProjectSessionController;
  let fileController!: WorkspaceFileController;
  let actionController!: WorkspaceActionController;

  const closeRepositoryMenu = (): void => patch({ repositoryMenu: undefined });
  const messageController = createMessageController({
    readMessages: () => state().systemMessages,
    writeMessages: (systemMessages) => patch({ systemMessages }),
    sourceLabel: (sourceIdentity) => sourceIdentity.startsWith('__unsaved__/')
      ? state().tabs.find((tab) => tab.sourceIdentity === sourceIdentity)?.title ?? sourceIdentity
      : sourceIdentity,
    now: () => Date.now(),
    randomId: () => Math.random().toString(36).slice(2)
  });
  const authController = createAuthController({
    surface: host.surface,
    currentUser: () => state().currentUser,
    setCurrentUser: (currentUser) => patch({ currentUser }),
    fetchCurrentUser: api.fetchCurrentUser,
    logoutCurrentUser: api.logoutCurrentUser,
    clearLocalWorkspaceStorage: storage.clearLocalWorkspaceStorage,
    routePath: api.routePath,
    currentLocation: () => `${window.location.pathname}${window.location.search}${window.location.hash}`,
    navigate: (href) => { window.location.href = href; },
    error: messageController.error
  });
  const repositoryController = createRepositoryController({
    createFolder: api.createFolder,
    deleteFile: api.deleteFile,
    deleteFolder: api.deleteFolder,
    renameFile: api.renameFile,
    renameFolder: api.renameFolder,
    saveFile: api.saveFile
  });
  const repositoryDialogController = createRepositoryDialogController({
    fileDialog: () => state().fileDialog,
    setFileDialog: (fileDialog) => patch({ fileDialog }),
    deleteDialog: () => state().deleteDialog,
    setDeleteDialog: (deleteDialog) => patch({ deleteDialog }),
    closeMenu: closeRepositoryMenu,
    authorize: (actionId) => actionController.authorizeRepositoryAction(actionId),
    projectId,
    tree: () => state().tree,
    openFilePaths: () => state().tabs.flatMap((tab) => tab.filePath === undefined ? [] : [tab.filePath]),
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
    acceptPublishedProjectId: (publishedProjectId) => patch({ publishedProjectId }),
    createProject: api.createProject,
    updateProject: api.updateProject,
    deleteProject: api.deleteProject,
    publishToPlayground: api.publishToPlayground,
    unpublishFromPlayground: api.unpublishFromPlayground
  });
  const projectDialogController = createProjectDialogController({
    dialog: () => state().projectDialog,
    setDialog: (projectDialog) => patch({ projectDialog }),
    projects: () => state().projectRegistry.projects,
    publishedProjectId: () => state().publishedProjectId,
    publicationAllowed: () => {
      const publication = actionController.publicationState();
      return !publication.hidden && !publication.disabled;
    },
    commands: projectController,
    switchProject: (id) => projectSession.switchProject(id),
    acceptDeletedProject: (id) => projectSession.acceptDeletedProject(id),
    redirectIfAuthRequired: authController.redirectIfAuthRequired
  });
  const tabController: TabController = createTabController({
    readState: () => ({
      tabs: state().tabs,
      activeTabId: state().activeTabId,
      editorTabId: state().editorTabId
    }),
    writeState: ({ tabs, activeTabId, editorTabId }) => patch({ tabs, activeTabId, editorTabId })
  });
  analysisController = createAnalysisController({
    schedule: (task, delay) => window.setTimeout(task, delay),
    cancel: (handle) => window.clearTimeout(handle),
    currentProjectId: projectId,
    linkedAnalysis: () => state().linkedAnalysis,
    clearLinkedAnalysis: () => patch({ linkedAnalysis: undefined }),
    closeDeploymentPicker: () => patch({ deploymentPickerOpen: false }),
    runLink: (sequence) => analysisRunner.runLink(sequence),
    runCachedDiagram: (sequence, requestedProjectId, analysis) => (
      analysisRunner.runCachedDiagram(sequence, requestedProjectId, analysis)
    ),
    checkSyntax: (sources) => monacoSession.checkSyntax(sources),
    defaultSyntaxSources: () => state().tabs.filter(isProjectSourceTab).map((tab) => ({
      sourceIdentity: tab.sourceIdentity,
      content: tab.content
    })),
    readDiagnostics: () => ({ local: state().localDiagnostics, linker: state().linkerDiagnostics }),
    writeDiagnostics: ({ local, linker }) => {
      patch({ localDiagnostics: local, linkerDiagnostics: linker });
      editorSynchronization.refreshDiagnostics();
    }
  });
  const diagramController = createDiagramController({
    activeTab,
    linkedAnalysis: () => state().linkedAnalysis,
    pickerOpen: () => state().deploymentPickerOpen,
    setPickerOpen: (deploymentPickerOpen) => patch({ deploymentPickerOpen }),
    refreshDisabled: () => state().refreshDisabled,
    setRefreshDisabled: (refreshDisabled) => patch({ refreshDisabled }),
    visibleScale: () => state().diagramVisibleScaleTabId === state().activeTabId
      ? state().diagramVisibleScale
      : activeTab()?.diagramScale ?? 1,
    setVisibleScale: (diagramVisibleScale) => patch({
      diagramVisibleScale,
      diagramVisibleScaleTabId: state().activeTabId
    }),
    patchActiveTab: (tabPatch) => {
      if (state().activeTabId !== undefined) tabController.patch(state().activeTabId!, tabPatch);
    },
    persistWorkspace: () => fileController.persistWorkspace(),
    scheduleLink: (delay) => analysisController.scheduleLink(delay),
    scheduleDiagramUpdate: () => analysisController.scheduleDiagramUpdate(),
    deferEditorLayout: () => void tick().then(() => monacoSession.layout()),
    schedule: (task, delay) => window.setTimeout(task, delay),
    cancel: (handle) => window.clearTimeout(handle)
  });
  const layoutController = createLayoutController({
    readState: () => state().projectUi,
    writeState: (projectUi) => patch({ projectUi }),
    persistWorkspace: () => fileController.persistWorkspace(),
    deferEditorLayout: () => void tick().then(() => monacoSession.layout()),
    addPointerMove: (listener) => window.addEventListener('pointermove', listener),
    removePointerMove: (listener) => window.removeEventListener('pointermove', listener),
    addPointerUp: (listener) => window.addEventListener('pointerup', listener),
    removePointerUp: (listener) => window.removeEventListener('pointerup', listener)
  });
  monacoSession = createMonacoSession({
    editorHost: host.editorHost,
    tabs: () => state().tabs,
    activeTab,
    activeTabId: () => state().activeTabId,
    editorTabId: () => state().editorTabId,
    selectEditorTab: (id) => tabController.selectEditor(id),
    editorSymbols: () => state().editorSymbols,
    completionSnapshot: () => state().workspaceCompletionSnapshot,
    diagnosticsFor: (tab) => analysisController.diagnosticsFor(tab),
    contentChanged: (tab, content) => fileController.contentChanged(tab, content)
  });
  const editorSynchronization = createEditorSynchronization({
    tabs: () => state().tabs,
    projectSymbols: () => state().projectSymbols,
    snapshotRevision: () => state().workspaceCompletionSnapshotRevision,
    writeEditorSymbols: (editorSymbols) => patch({ editorSymbols }),
    writeProjectStructure: (projectStructure, workspaceCompletionSnapshot, workspaceCompletionSnapshotRevision) => patch({
      projectStructure,
      workspaceCompletionSnapshot,
      workspaceCompletionSnapshotRevision
    }),
    replaceDiagnostics: (read) => tabController.replaceDiagnostics(read),
    diagnosticsFor: (sourceIdentity) => analysisController.diagnosticsFor({ sourceIdentity }),
    refreshMarkers: monacoSession.refreshMarkers,
    refreshTokenVocabulary: monacoSession.refreshTokenVocabulary
  });
  analysisRunner = createAnalysisRunner({
    state: () => ({
      projectId: projectId(),
      surface: host.surface(),
      tabs: state().tabs,
      activeTab: activeTab(),
      overlays: state().overlays,
      query: activeTab()?.query ?? defaultQuery,
      diagramMode: activeTab()?.diagramMode ?? defaultDiagramMode,
      deploymentEnvironment: activeTab()?.deploymentEnvironment
    }),
    linkProject: api.linkProject,
    renderInBrowser: diagram.renderDotInBrowser,
    renderOnServer: api.renderProjectSvg,
    checkSyntax: (sources) => monacoSession.checkSyntax(sources),
    isCurrent: (sequence, requestedProjectId) => analysisController.isCurrentLink(sequence, requestedProjectId),
    updateLocalDiagnostics: (sources, diagnostics) => analysisController.updateLocalDiagnostics(sources, diagnostics),
    updateLinkerDiagnostics: (diagnostics, sources) => analysisController.updateLinkerDiagnostics(diagnostics, sources),
    setLoading: (analysisLoading) => patch({ analysisLoading }),
    acceptProjectSymbols: (projectSymbols) => patch({ projectSymbols }),
    acceptLinkedAnalysis: (linkedAnalysis) => patch({ linkedAnalysis }),
    reconcileDeploymentEnvironment: (analysis) => diagramController.reconcileDeploymentEnvironment(analysis),
    refreshEditorSymbols: editorSynchronization.refreshEditorSymbols,
    acceptProjectStructure: editorSynchronization.acceptProjectStructure,
    clearDots: (sourceIdentities) => tabController.clearDots(sourceIdentities),
    acceptDiagram: (sourceIdentity, svg, dot) => tabController.patchBySourceIdentity(sourceIdentity, { svg, dot }),
    cycleSummary: messageController.cycleSummary,
    queryError: messageController.queryError,
    error: messageController.error,
    redirectIfAuthRequired: authController.redirectIfAuthRequired,
    scheduleDiagramUpdate: () => analysisController.scheduleDiagramUpdate()
  });
  projectSession = createProjectSessionController({
    surface: host.surface,
    readState: () => ({
      registry: state().projectRegistry,
      activeProjectId: state().activeProjectId,
      tree: state().tree,
      projectSymbols: state().projectSymbols,
      projectStructure: state().projectStructure,
      analysisLoading: state().analysisLoading,
      overlays: state().overlays,
      publishedProjectId: state().publishedProjectId
    }),
    writeState: (next) => patch({
      projectRegistry: next.registry,
      activeProjectId: next.activeProjectId,
      tree: next.tree,
      projectSymbols: next.projectSymbols,
      projectStructure: next.projectStructure,
      analysisLoading: next.analysisLoading,
      overlays: next.overlays,
      publishedProjectId: next.publishedProjectId
    }),
    fetchProjects: api.fetchProjects,
    fetchPublication: api.fetchPlaygroundPublication,
    fetchTree: api.fetchTree,
    readRegistry: storage.readProjectRegistry,
    writeRegistry: storage.writeProjectRegistry,
    readWorkspace: storage.readWorkspace,
    clearProjectStorage: storage.clearProjectStorage,
    clearLocalWorkspaceStorage: storage.clearLocalWorkspaceStorage,
    resetWorkspaceTools: () => {
      monacoSession.reset();
      tabController.reset();
      analysisController.reset();
      diagramController.reset();
      messageController.reset();
    },
    refreshEditorSymbols: editorSynchronization.refreshEditorSymbols,
    setProjectUi: (projectUi) => patch({ projectUi }),
    normalizeProjectUi,
    restoreFileTab: (tab, guard) => fileController.openFile(tab.filePath!, false, false, tab, undefined, guard),
    restoreLocalTab: (tab) => fileController.restoreLocalTab(tab),
    tabs: () => state().tabs,
    activateTab: (tabId, guard) => fileController.activateTab(tabId, guard),
    scheduleLink: (delay) => analysisController.scheduleLink(delay),
    defer: tick,
    redirectIfAuthRequired: authController.redirectIfAuthRequired,
    error: messageController.error
  });
  fileController = createWorkspaceFileController({
    surface: host.surface,
    projectId,
    storageProjectId: () => projectSession.storageProjectId(projectId()),
    activeProjectId: () => state().activeProjectId,
    tabs: () => state().tabs,
    activeTab,
    activeTabId: () => state().activeTabId,
    overlays: () => state().overlays,
    setOverlays: (overlays) => patch({ overlays }),
    projectUi: () => state().projectUi,
    tree: () => state().tree,
    setTree: (tree) => patch({ tree }),
    tabController,
    monacoSession: () => monacoSession,
    analysisController: () => analysisController,
    fetchFile: api.fetchFile,
    saveFile: api.saveFile,
    fetchTree: api.fetchTree,
    readLocalSource: storage.readLocalSource,
    hasLocalSource: storage.hasLocalSource,
    writeLocalSource: storage.writeLocalSource,
    removeLocalSource: storage.removeLocalSource,
    writeWorkspace: storage.writeWorkspace,
    authorizeNewTab: () => actionController.require('workspace.tab.create', actionController.newTabState()),
    authorizeSave: () => actionController.require('repository.file.save', actionController.saveState()),
    openFileDialog: repositoryDialogController.openFileDialog,
    coreSource: workspaceCoreSources.source,
    coreSourceExists: workspaceCoreSources.exists,
    coreSourceIdentity: workspaceCoreSources.identity,
    readonlyCoreTabId: workspaceCoreSources.readonlyTabId,
    currentProjectLoad: (guard) => projectSession.currentProjectLoad(guard),
    setDeploymentPickerOpen: (deploymentPickerOpen) => patch({ deploymentPickerOpen }),
    refreshEditorTokenVocabulary: editorSynchronization.refreshEditorTokenVocabulary,
    defer: tick,
    redirectIfAuthRequired: authController.redirectIfAuthRequired,
    info: messageController.info,
    error: messageController.error,
    fileSaved: messageController.fileSaved
  });
  actionController = createWorkspaceActionController({
    surface: host.surface,
    capabilities: () => state().currentUser.capabilities ?? [],
    projects: () => state().projectRegistry.projects,
    activeProjectId: () => state().activeProjectId,
    activeTab,
    info: messageController.info,
    newFile: () => fileController.newFile(),
    saveActiveTab: () => fileController.saveActiveTab(),
    openProjectDialog: (create) => projectDialogController.open(create)
  });
  const downloadController = createDownloadController({
    activeTab,
    canDownloadDiagram: () => canDownloadWorkspaceDiagram(state()),
    sanitizeSvg: diagram.sanitizeSvg,
    svgToPngBlob: diagram.svgToPngBlob,
    downloadText: diagram.downloadText,
    downloadBlob: diagram.downloadBlob,
    error: messageController.error
  });

  const controllers = {
    auth: authController,
    action: actionController,
    diagram: diagramController,
    download: downloadController,
    file: fileController,
    layout: layoutController,
    projectDialog: projectDialogController,
    repositoryDialog: repositoryDialogController
  };
  const lifecycle = createWorkspaceRuntimeLifecycle({
    host,
    auth: authController,
    action: actionController,
    analysis: analysisController,
    diagram: diagramController,
    layout: layoutController,
    messages: messageController,
    monaco: monacoSession,
    projects: projectSession,
    closeRepositoryMenu
  });

  return {
    authController,
    actionController,
    diagramController,
    downloadController,
    fileController,
    layoutController,
    projectDialogController,
    projectSession,
    repositoryDialogController,
    controllers,
    ...lifecycle,

    openRepositoryMenu(node, event) {
      event.preventDefault();
      event.stopPropagation();
      patch({ repositoryMenu: { node, x: event.clientX, y: event.clientY } });
    },

    closeRepositoryMenu
  };
}
