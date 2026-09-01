import type { LanguageSnapshot } from '@insight/language';
import type { ProjectStructure } from '$lib/api';
import type { WorkspaceSurface } from '$lib/actions/action-model';
import type {
  ProjectRegistryState,
  ProjectSummary,
  WorkspaceState,
  WorkspaceTabState
} from '$lib/storage';
import type { ProjectUiState, TreeNode, WorkspaceTab } from '$lib/workspace-types';
import { errorMessage } from '../messages/message-controller';

export type ProjectLoadGuard = {
  readonly projectId: string;
  readonly storageProjectId: string;
  readonly generation: number;
};

export type ProjectSessionState = {
  readonly registry: ProjectRegistryState;
  readonly activeProjectId: string | undefined;
  readonly tree: TreeNode | undefined;
  readonly projectSymbols: LanguageSnapshot;
  readonly projectStructure: ProjectStructure | undefined;
  readonly analysisLoading: boolean;
  readonly overlays: Record<string, string>;
  readonly publishedProjectId: string | undefined;
};

export type ProjectSessionControllerPorts = {
  surface(): WorkspaceSurface;
  readState(): ProjectSessionState;
  writeState(state: ProjectSessionState): void;
  fetchProjects(surface: WorkspaceSurface): Promise<{ readonly projects: ProjectSummary[] }>;
  fetchPublication(): Promise<{ readonly repositoryId: string } | null>;
  fetchTree(projectId: string, surface: WorkspaceSurface): Promise<{ readonly root: TreeNode }>;
  readRegistry(): ProjectRegistryState;
  writeRegistry(registry: ProjectRegistryState): void;
  readWorkspace(storageProjectId: string): WorkspaceState;
  clearProjectStorage(projectId: string): void;
  clearLocalWorkspaceStorage(): void;
  resetWorkspaceTools(): void;
  refreshEditorSymbols(): void;
  setProjectUi(ui: ProjectUiState): void;
  normalizeProjectUi(ui: WorkspaceState['ui'], tabs: readonly WorkspaceTabState[]): ProjectUiState;
  restoreFileTab(tab: WorkspaceTabState, guard: ProjectLoadGuard): Promise<void>;
  restoreLocalTab(tab: WorkspaceTabState): void;
  tabs(): readonly WorkspaceTab[];
  activateTab(tabId: string, guard: ProjectLoadGuard): Promise<void>;
  scheduleLink(delay: number): void;
  defer(): Promise<void>;
  redirectIfAuthRequired(error: unknown): boolean;
  error(message: string): void;
};

export type ProjectSessionController = {
  loadProjects(): Promise<void>;
  loadPublication(): Promise<void>;
  loadProject(): Promise<void>;
  switchProject(projectId: string): Promise<void>;
  acceptCreatedProject(project: ProjectSummary): void;
  acceptUpdatedProject(project: ProjectSummary): void;
  acceptDeletedProject(projectId: string): Promise<number>;
  resetWorkspaceState(): void;
  currentProjectLoad(guard: ProjectLoadGuard): boolean;
  storageProjectId(projectId?: string): string;
};

export function createProjectSessionController(
  ports: ProjectSessionControllerPorts
): ProjectSessionController {
  let generation = 0;

  const patch = (change: Partial<ProjectSessionState>): void => {
    ports.writeState({ ...ports.readState(), ...change });
  };

  const storageProjectId = (projectId = ports.readState().activeProjectId ?? ''): string => (
    ports.surface() === 'playground' ? `playground:${projectId}` : projectId
  );

  const currentProjectLoad = (guard: ProjectLoadGuard): boolean => {
    const state = ports.readState();
    return guard.generation === generation
      && guard.projectId === state.activeProjectId
      && guard.storageProjectId === storageProjectId(guard.projectId);
  };

  const resetWorkspaceState = (): void => {
    generation += 1;
    ports.resetWorkspaceTools();
    patch({
      tree: undefined,
      projectSymbols: emptyProjectSymbols(),
      projectStructure: undefined,
      analysisLoading: false,
      overlays: {}
    });
  };

  const loadProject = async (): Promise<void> => {
    const activeProjectId = ports.readState().activeProjectId;
    if (activeProjectId === undefined) return;
    const loadingProjectId = activeProjectId;
    const loadGeneration = ++generation;
    const targetStorageProjectId = storageProjectId(loadingProjectId);
    patch({ analysisLoading: true });
    try {
      const tree = await ports.fetchTree(loadingProjectId, ports.surface());
      const guard = {
        projectId: loadingProjectId,
        storageProjectId: targetStorageProjectId,
        generation: loadGeneration
      };
      if (!currentProjectLoad(guard)) return;
      patch({ tree: tree.root });
      const workspace = ports.readWorkspace(targetStorageProjectId);
      ports.setProjectUi(ports.normalizeProjectUi(workspace.ui, workspace.tabs));
      for (const tab of workspace.tabs) {
        if (!currentProjectLoad(guard)) return;
        if (tab.filePath === undefined) ports.restoreLocalTab(tab);
        else await ports.restoreFileTab(tab, guard);
      }
      if (!currentProjectLoad(guard)) return;
      const restoredTabs = ports.tabs();
      const activeTabId = workspace.activeTab !== undefined
        && restoredTabs.some((tab) => tab.id === workspace.activeTab)
        ? workspace.activeTab
        : restoredTabs[0]?.id;
      if (activeTabId !== undefined) await ports.activateTab(activeTabId, guard);
      if (currentProjectLoad(guard)) ports.scheduleLink(0);
    } catch (error) {
      if (loadGeneration === generation) patch({ analysisLoading: false });
      if (!ports.redirectIfAuthRequired(error)) {
        ports.error(`Server error: ${errorMessage(error)}`);
      }
    }
  };

  const switchProject = async (nextProjectId: string): Promise<void> => {
    const state = ports.readState();
    if (nextProjectId === state.activeProjectId) return;
    resetWorkspaceState();
    ports.clearLocalWorkspaceStorage();
    const registry = { ...state.registry, activeProjectId: nextProjectId };
    patch({ activeProjectId: nextProjectId, registry });
    ports.writeRegistry(registry);
    await ports.defer();
    await loadProject();
  };

  return {
    async loadProjects() {
      const projects = (await ports.fetchProjects(ports.surface())).projects;
      const stored = ports.readRegistry();
      const activeProjectId = stored.activeProjectId !== undefined
        && projects.some((project) => project.id === stored.activeProjectId)
        ? stored.activeProjectId
        : projects[0]?.id;
      const registry = { activeProjectId, projects };
      patch({ registry, activeProjectId });
      ports.writeRegistry(registry);
      if (activeProjectId === undefined) {
        resetWorkspaceState();
        ports.refreshEditorSymbols();
      }
    },

    async loadPublication() {
      const publication = await ports.fetchPublication();
      patch({ publishedProjectId: publication?.repositoryId });
    },

    loadProject,
    switchProject,

    acceptCreatedProject(project) {
      const state = ports.readState();
      patch({
        registry: {
          projects: [project, ...state.registry.projects],
          activeProjectId: state.activeProjectId
        }
      });
    },

    acceptUpdatedProject(project) {
      const state = ports.readState();
      const registry = {
        ...state.registry,
        projects: state.registry.projects.map((item) => item.id === project.id ? project : item)
      };
      patch({
        registry,
        tree: state.tree !== undefined && project.id === state.activeProjectId
          ? { ...state.tree, name: project.name }
          : state.tree
      });
      ports.writeRegistry(registry);
    },

    async acceptDeletedProject(targetId) {
      ports.clearProjectStorage(targetId);
      const state = ports.readState();
      const projects = state.registry.projects.filter((project) => project.id !== targetId);
      patch({ registry: { projects, activeProjectId: state.activeProjectId } });
      if (state.activeProjectId === targetId) {
        const nextProjectId = projects[0]?.id;
        if (nextProjectId !== undefined) {
          await switchProject(nextProjectId);
        } else {
          resetWorkspaceState();
          const registry = { projects: [] };
          patch({ activeProjectId: undefined, registry });
          ports.writeRegistry(registry);
          ports.refreshEditorSymbols();
        }
      } else {
        ports.writeRegistry({ projects, activeProjectId: state.activeProjectId });
      }
      return projects.length;
    },

    resetWorkspaceState,
    currentProjectLoad,
    storageProjectId
  };
}

export function emptyProjectSymbols(): LanguageSnapshot {
  return { schemaVersion: 'empty', types: [], constructors: [], operators: [], enums: [] };
}
