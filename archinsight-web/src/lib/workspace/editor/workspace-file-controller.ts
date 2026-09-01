import type { WorkspaceSurface } from '$lib/actions/action-model';
import type { WorkspaceTabState } from '$lib/storage';
import type { ProjectUiState, SourceLocation, TreeNode, WorkspaceTab } from '$lib/workspace-types';
import type { AnalysisController } from '../analysis/analysis-controller';
import { emptyDiagramSvg } from '../diagram/diagram-controller';
import { errorMessage } from '../messages/message-controller';
import type { ProjectLoadGuard } from '../projects/project-session-controller';
import type { RepositoryFileEffect } from '../repository/repository-controller';
import {
  baseName,
  defaultDialogFileName,
  replaceDirectoryPrefix
} from '../repository/repository-paths';
import { repositoryFilePathsInDirectory } from '../repository/repository-tree';
import type { FileDialogState } from '../repository/repository-dialog-types';
import type { MonacoSession } from './monaco-session';
import type { TabController } from './tab-controller';
import {
  isProjectSourceTab,
  tabToolbarState,
  virtualSourceIdentity,
  workspaceTabState
} from './tab-persistence';

export type DiagramQueryState = Pick<WorkspaceTab, 'diagramMode' | 'query' | 'queryPreset'>;

export type WorkspaceFileControllerPorts = {
  surface(): WorkspaceSurface;
  projectId(): string;
  storageProjectId(): string;
  activeProjectId(): string | undefined;
  tabs(): WorkspaceTab[];
  activeTab(): WorkspaceTab | undefined;
  activeTabId(): string | undefined;
  overlays(): Record<string, string>;
  setOverlays(overlays: Record<string, string>): void;
  projectUi(): ProjectUiState;
  tree(): TreeNode | undefined;
  setTree(tree: TreeNode): void;
  tabController: TabController;
  monacoSession(): MonacoSession;
  analysisController(): AnalysisController;
  fetchFile(projectId: string, path: string, surface: WorkspaceSurface): Promise<{ readonly content: string }>;
  saveFile(projectId: string, path: string, request: { readonly content: string }): Promise<{ readonly path: string }>;
  fetchTree(projectId: string, surface: WorkspaceSurface): Promise<{ readonly root: TreeNode }>;
  readLocalSource(projectId: string, path: string): string | undefined;
  hasLocalSource(projectId: string, path: string): boolean;
  writeLocalSource(projectId: string, path: string, content: string): void;
  removeLocalSource(projectId: string, path: string): void;
  writeWorkspace(projectId: string, state: {
    tabs: WorkspaceTabState[];
    activeTab?: string;
    ui: ProjectUiState;
  }): void;
  authorizeNewTab(): boolean;
  authorizeSave(): boolean;
  openFileDialog(dialog: FileDialogState): void;
  coreSource(sourceIdentity: string): string;
  coreSourceExists(sourceIdentity: string): boolean;
  coreSourceIdentity(): string;
  readonlyCoreTabId(sourceIdentity: string): string;
  currentProjectLoad(guard: ProjectLoadGuard): boolean;
  setDeploymentPickerOpen(open: boolean): void;
  refreshEditorTokenVocabulary(options?: { readonly repaint?: boolean }): void;
  defer(): Promise<void>;
  redirectIfAuthRequired(error: unknown): boolean;
  info(message: string): void;
  error(message: string): void;
  fileSaved(path: string): void;
};

export type WorkspaceFileController = {
  contentChanged(tab: WorkspaceTab, content: string): void;
  openFile(
    path: string,
    activate?: boolean,
    render?: boolean,
    restored?: WorkspaceTabState,
    queryState?: DiagramQueryState,
    loadGuard?: ProjectLoadGuard
  ): Promise<void>;
  goToDeclaration(declaration: SourceLocation): Promise<void>;
  openCoreSource(sourceIdentity?: string, queryState?: DiagramQueryState): Promise<void>;
  newFile(): Promise<void>;
  restoreLocalTab(tab: WorkspaceTabState): void;
  activateTab(id: string, loadGuard?: ProjectLoadGuard): Promise<void>;
  closeTab(id: string): void;
  persistWorkspace(): void;
  saveActiveTab(): Promise<void>;
  acceptDeletedFiles(paths: readonly string[]): Promise<void>;
  acceptFileEffect(effect: RepositoryFileEffect): Promise<void>;
  refreshProjectMetadata(): Promise<void>;
};

export function createWorkspaceFileController(
  ports: WorkspaceFileControllerPorts
): WorkspaceFileController {
  let untitledCounter = 1;

  const analysis = (): AnalysisController => ports.analysisController();
  const monaco = (): MonacoSession => ports.monacoSession();

  const persistWorkspace = (): void => {
    if (ports.activeProjectId() === undefined) return;
    const persistentTabs = ports.tabs().filter(isProjectSourceTab);
    const activeTabId = ports.activeTabId();
    ports.writeWorkspace(ports.storageProjectId(), {
      tabs: persistentTabs.map(workspaceTabState),
      activeTab: activeTabId !== undefined && persistentTabs.some((tab) => tab.id === activeTabId)
        ? activeTabId
        : undefined,
      ui: ports.projectUi()
    });
  };

  const currentDiagramQueryState = (): DiagramQueryState | undefined => {
    const tab = ports.activeTab();
    return tab === undefined ? undefined : {
      diagramMode: tab.diagramMode,
      query: tab.query,
      queryPreset: tab.queryPreset
    };
  };

  const applyInheritedQuery = (tabId: string, queryState: DiagramQueryState | undefined): void => {
    if (queryState === undefined) return;
    const next = tabToolbarState(queryState);
    ports.tabController.patch(tabId, {
      diagramMode: next.diagramMode,
      query: next.query,
      queryPreset: next.queryPreset,
      dot: undefined
    });
    persistWorkspace();
  };

  const activateTab = async (id: string, loadGuard?: ProjectLoadGuard): Promise<void> => {
    if (loadGuard !== undefined && !ports.currentProjectLoad(loadGuard)) return;
    ports.tabController.activate(id);
    ports.setDeploymentPickerOpen(false);
    persistWorkspace();
    await ports.defer();
    if (loadGuard !== undefined && !ports.currentProjectLoad(loadGuard)) return;
    monaco().syncActiveTab();
    analysis().scheduleDiagramUpdate();
  };

  const openFile = async (
    path: string,
    activate = true,
    render = true,
    restored?: WorkspaceTabState,
    queryState?: DiagramQueryState,
    loadGuard?: ProjectLoadGuard
  ): Promise<void> => {
    if (loadGuard !== undefined && !ports.currentProjectLoad(loadGuard)) return;
    const existing = ports.tabs().find((tab) => tab.filePath === path);
    if (existing !== undefined) {
      applyInheritedQuery(existing.id, queryState);
      if (activate) await activateTab(existing.id);
      return;
    }
    const projectId = loadGuard?.projectId ?? ports.projectId();
    const storageProjectId = loadGuard?.storageProjectId ?? ports.storageProjectId();
    const localContent = ports.readLocalSource(storageProjectId, path);
    let content: string;
    try {
      content = localContent ?? (await ports.fetchFile(projectId, path, ports.surface())).content;
    } catch (error) {
      if (!ports.redirectIfAuthRequired(error)) ports.error(`Server error: ${errorMessage(error)}`);
      return;
    }
    if (loadGuard !== undefined && !ports.currentProjectLoad(loadGuard)) return;
    if (ports.hasLocalSource(storageProjectId, path)) {
      ports.setOverlays({ ...ports.overlays(), [path]: content });
    }
    monaco().ensureModel(path, content);
    ports.tabController.append({
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
    ports.refreshEditorTokenVocabulary();
    persistWorkspace();
    if (activate) await activateTab(path);
    if (render) {
      analysis().scheduleLiveSyntaxCheck([{ sourceIdentity: path, content }]);
      if (localContent === undefined) analysis().scheduleDiagramUpdate();
      else analysis().scheduleLink();
    }
  };

  const openCoreSource = async (
    sourceIdentity = ports.coreSourceIdentity(),
    queryState?: DiagramQueryState
  ): Promise<void> => {
    const tabId = ports.readonlyCoreTabId(sourceIdentity);
    const existing = ports.tabs().find((tab) => tab.id === tabId);
    if (existing !== undefined) {
      applyInheritedQuery(existing.id, queryState);
      await activateTab(existing.id);
      return;
    }
    const source = ports.coreSource(sourceIdentity);
    monaco().ensureModel(tabId, source);
    ports.tabController.append({
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
    ports.refreshEditorTokenVocabulary();
    await activateTab(tabId);
  };

  const retargetOpenTab = (tabId: string, path: string, content: string, local: boolean): void => {
    const transition = ports.tabController.retarget(tabId, {
      path,
      title: baseName(path),
      content,
      local
    });
    const tab = transition.previousTab;
    const targetId = transition.targetId;
    if (tab === undefined || targetId === undefined) return;
    monaco().retargetModel(tab.id, targetId);
    analysis().removeDiagnostics([tab.sourceIdentity]);
    monaco().syncActiveTab();
    ports.refreshEditorTokenVocabulary();
  };

  const closeTab = (id: string): void => {
    const tab = ports.tabs().find((item) => item.id === id);
    const closingActiveTab = ports.activeTabId() === id;
    const overlays = ports.overlays();
    const removesSemanticInput = tab !== undefined
      && isProjectSourceTab(tab)
      && (tab.filePath === undefined || Object.hasOwn(overlays, tab.filePath));
    if (tab?.filePath !== undefined) {
      ports.removeLocalSource(ports.storageProjectId(), tab.filePath);
      const nextOverlays = { ...overlays };
      delete nextOverlays[tab.filePath];
      ports.setOverlays(nextOverlays);
    }
    if (tab !== undefined) analysis().removeDiagnostics([tab.sourceIdentity]);
    ports.tabController.remove(id);
    monaco().removeModel(id);
    ports.refreshEditorTokenVocabulary();
    if (closingActiveTab) {
      monaco().syncActiveTab();
      if (removesSemanticInput) analysis().scheduleLink();
      else analysis().scheduleDiagramUpdate();
    } else if (removesSemanticInput) {
      analysis().scheduleLink();
    }
    persistWorkspace();
  };

  const retargetTabsForRename = (sourcePath: string, targetPath: string): void => {
    const tab = ports.tabs().find((item) => item.filePath === sourcePath);
    const overlays = { ...ports.overlays() };
    if (tab === undefined) {
      ports.removeLocalSource(ports.storageProjectId(), sourcePath);
      delete overlays[sourcePath];
      ports.setOverlays(overlays);
      return;
    }
    retargetOpenTab(tab.id, targetPath, tab.content, tab.local);
    if (tab.local) {
      overlays[targetPath] = tab.content;
      ports.writeLocalSource(ports.storageProjectId(), targetPath, tab.content);
    }
    ports.removeLocalSource(ports.storageProjectId(), sourcePath);
    delete overlays[sourcePath];
    ports.setOverlays(overlays);
  };

  const saveTabToPath = async (tab: WorkspaceTab, path: string): Promise<void> => {
    if (!ports.authorizeSave()) return;
    try {
      const result = await ports.saveFile(ports.projectId(), path, { content: tab.content });
      ports.removeLocalSource(ports.storageProjectId(), tab.filePath ?? path);
      ports.removeLocalSource(ports.storageProjectId(), result.path);
      const overlays = { ...ports.overlays() };
      delete overlays[tab.filePath ?? path];
      delete overlays[result.path];
      ports.setOverlays(overlays);
      if (tab.filePath === undefined || tab.filePath !== result.path) {
        retargetOpenTab(tab.id, result.path, tab.content, false);
      } else {
        ports.tabController.patch(tab.id, { local: false });
      }
      await refreshProjectMetadata();
      persistWorkspace();
      analysis().scheduleLink();
      ports.fileSaved(result.path);
    } catch (error) {
      if (!ports.redirectIfAuthRequired(error)) ports.error(`Server error: ${errorMessage(error)}`);
    }
  };

  const refreshProjectMetadata = async (): Promise<void> => {
    const response = await ports.fetchTree(ports.projectId(), ports.surface());
    ports.setTree(response.root);
  };

  return {
    contentChanged(tab, content) {
      ports.tabController.patch(tab.id, { content, local: true, dot: undefined });
      if (tab.filePath !== undefined) {
        ports.setOverlays({ ...ports.overlays(), [tab.filePath]: content });
        ports.writeLocalSource(ports.storageProjectId(), tab.filePath, content);
      }
      analysis().scheduleLink();
      persistWorkspace();
      ports.refreshEditorTokenVocabulary({ repaint: false });
      analysis().scheduleLiveSyntaxCheck([{ sourceIdentity: tab.sourceIdentity, content }]);
    },

    openFile,

    async goToDeclaration(declaration) {
      const queryState = currentDiagramQueryState();
      if (ports.coreSourceExists(declaration.source)) {
        await openCoreSource(declaration.source, queryState);
      } else {
        await openFile(declaration.source, true, true, undefined, queryState);
      }
      await ports.defer();
      monaco().reveal(declaration);
    },

    openCoreSource,

    async newFile() {
      if (!ports.authorizeNewTab()) return;
      const index = untitledCounter++;
      const id = `untitled:${index}`;
      ports.tabController.append({
        id,
        sourceIdentity: virtualSourceIdentity(id),
        title: `Untitled ${index}`,
        content: '',
        svg: emptyDiagramSvg('Unsaved file is not part of the project yet'),
        diagnostics: [],
        local: true,
        ...tabToolbarState()
      });
      ports.refreshEditorTokenVocabulary();
      persistWorkspace();
      await activateTab(id);
    },

    restoreLocalTab(tab) {
      const id = ports.tabController.uniqueId(tab.id);
      const sourceIdentity = tab.sourceIdentity ?? virtualSourceIdentity(id);
      monaco().ensureModel(id, tab.content ?? '');
      ports.tabController.append({
        id,
        sourceIdentity,
        title: tab.title,
        content: tab.content ?? '',
        svg: emptyDiagramSvg('Unsaved file is not part of the project yet'),
        diagnostics: [],
        local: true,
        ...tabToolbarState(tab)
      });
      untitledCounter = Math.max(untitledCounter, nextUntitledCounter(id, tab.title));
      ports.refreshEditorTokenVocabulary();
      analysis().scheduleLiveSyntaxCheck([{ sourceIdentity, content: tab.content ?? '' }]);
    },

    activateTab,
    closeTab,
    persistWorkspace,

    async saveActiveTab() {
      if (!ports.authorizeSave()) return;
      const tab = ports.activeTab();
      if (tab === undefined) return;
      if (tab.readOnly === true) {
        ports.info(`${tab.title} is read-only`);
        return;
      }
      if (tab.filePath === undefined) {
        ports.openFileDialog({
          mode: 'save',
          target: 'file',
          title: 'Save file',
          directory: '',
          fileName: defaultDialogFileName(tab.title, 'untitled'),
          tabId: tab.id,
          content: tab.content
        });
        return;
      }
      await saveTabToPath(tab, tab.filePath);
    },

    async acceptDeletedFiles(paths) {
      for (const path of paths) {
        const tab = ports.tabs().find((item) => item.filePath === path);
        if (tab !== undefined) closeTab(tab.id);
        ports.removeLocalSource(ports.storageProjectId(), path);
        const overlays = { ...ports.overlays() };
        delete overlays[path];
        ports.setOverlays(overlays);
      }
      analysis().removeDiagnostics([...paths]);
      ports.refreshEditorTokenVocabulary();
    },

    async acceptFileEffect(effect) {
      switch (effect.kind) {
        case 'file-renamed':
          retargetTabsForRename(effect.sourcePath, effect.path);
          return;
        case 'folder-renamed': {
          const paths = ports.tabs().flatMap((tab) => tab.filePath === undefined ? [] : [tab.filePath]);
          const files = repositoryFilePathsInDirectory(ports.tree(), effect.sourcePath, paths);
          for (const path of files) {
            retargetTabsForRename(path, replaceDirectoryPrefix(path, effect.sourcePath, effect.path));
          }
          return;
        }
        case 'file-saved':
          if (effect.tabId !== undefined) {
            retargetOpenTab(effect.tabId, effect.path, effect.content, false);
          } else {
            await openFile(effect.path);
          }
          ports.fileSaved(effect.path);
          return;
        case 'folder-created':
          return;
      }
    },

    refreshProjectMetadata
  };
}

export function nextUntitledCounter(id: string, title: string): number {
  const match = /^(?:untitled:|Untitled )(\d+)$/.exec(id)
    ?? /^(?:untitled:|Untitled )(\d+)$/.exec(title);
  return match === null ? 1 : Number(match[1]) + 1;
}
