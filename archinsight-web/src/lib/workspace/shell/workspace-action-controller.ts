import type { AppCapability } from '$lib/api';
import {
  canExecute,
  controlState,
  type ActionId,
  type ControlState,
  type WorkspaceSurface
} from '$lib/actions/action-model';
import {
  emptyWorkspaceStrategy,
  type EmptyWorkspaceAction,
  type EmptyWorkspaceStrategy
} from '$lib/empty-workspace-strategy';
import type { ProjectSummary } from '$lib/storage';
import type { WorkspaceTab } from '$lib/workspace-types';

export type RepositoryActionStates = {
  readonly createFile: ControlState;
  readonly createFolder: ControlState;
  readonly renameFile: ControlState;
  readonly renameFolder: ControlState;
  readonly deleteFile: ControlState;
  readonly deleteFolder: ControlState;
};

export type WorkspaceActionControllerPorts = {
  surface(): WorkspaceSurface;
  capabilities(): readonly AppCapability[];
  projects(): ProjectSummary[];
  activeProjectId(): string | undefined;
  activeTab(): WorkspaceTab | undefined;
  info(message: string): void;
  newFile(): void | Promise<void>;
  saveActiveTab(): void | Promise<void>;
  openProjectDialog(create: boolean): void;
};

export type WorkspaceActionController = {
  state(actionId: ActionId, available?: boolean, reason?: string): ControlState;
  newTabState(): ControlState;
  saveState(): ControlState;
  publicationState(): ControlState;
  repositoryStates(): RepositoryActionStates;
  emptyStrategy(): EmptyWorkspaceStrategy;
  require(actionId: ActionId, state?: ControlState): boolean;
  authorizeRepositoryAction(actionId: ActionId): boolean;
  handleEmptyAction(action: EmptyWorkspaceAction): void;
  handleGlobalKeydown(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key' | 'preventDefault'>): void;
  manageProjects(): void;
};

export function createWorkspaceActionController(
  ports: WorkspaceActionControllerPorts
): WorkspaceActionController {
  const state = (
    actionId: ActionId,
    available = true,
    reason = 'Action is unavailable'
  ): ControlState => controlState(actionId, {
    surface: ports.surface(),
    capabilities: ports.capabilities(),
    available,
    unavailableReason: reason
  });

  const newTabState = (): ControlState => state('workspace.tab.create');
  const saveState = (): ControlState => {
    const tab = ports.activeTab();
    return state(
      'repository.file.save',
      tab !== undefined && tab.readOnly !== true,
      tab?.readOnly === true ? 'File is read-only' : 'No active file'
    );
  };
  const requireAction = (actionId: ActionId, control = state(actionId)): boolean => {
    if (canExecute(control)) return true;
    ports.info(control.reason ?? 'Action is unavailable');
    return false;
  };

  const repositoryState = (actionId: ActionId): ControlState => state(
    actionId,
    ports.activeProjectId() !== undefined,
    'No active project'
  );

  const repositoryStates = (): RepositoryActionStates => ({
    createFile: repositoryState('repository.file.create'),
    createFolder: repositoryState('repository.folder.create'),
    renameFile: repositoryState('repository.file.rename'),
    renameFolder: repositoryState('repository.folder.rename'),
    deleteFile: repositoryState('repository.file.delete'),
    deleteFolder: repositoryState('repository.folder.delete')
  });

  const authorizeRepositoryAction = (actionId: ActionId): boolean => {
    const states = repositoryStates();
    switch (actionId) {
      case 'repository.file.create': return requireAction(actionId, states.createFile);
      case 'repository.folder.create': return requireAction(actionId, states.createFolder);
      case 'repository.file.rename': return requireAction(actionId, states.renameFile);
      case 'repository.folder.rename': return requireAction(actionId, states.renameFolder);
      case 'repository.file.delete': return requireAction(actionId, states.deleteFile);
      case 'repository.folder.delete': return requireAction(actionId, states.deleteFolder);
      case 'repository.file.save': return requireAction(actionId, saveState());
      default: return requireAction(actionId);
    }
  };

  return {
    state,
    newTabState,
    saveState,
    publicationState: () => state('publication.toggle'),
    repositoryStates,

    emptyStrategy() {
      const strategy = emptyWorkspaceStrategy(ports.projects(), ports.activeProjectId());
      return {
        ...strategy,
        actions: strategy.actions.flatMap((action) => {
          const actionId: ActionId = action.id === 'create-tab'
            ? 'workspace.tab.create'
            : action.id === 'create-project'
              ? 'repository.project.create'
              : 'repository.project.manage';
          const control = state(actionId);
          return control.hidden
            ? []
            : [{ ...action, disabled: control.disabled, reason: control.reason }];
        })
      };
    },

    require: requireAction,
    authorizeRepositoryAction,

    handleEmptyAction(action) {
      if (action.id === 'create-tab') {
        if (canExecute(newTabState())) void ports.newFile();
        return;
      }
      const actionId = action.id === 'create-project'
        ? 'repository.project.create'
        : 'repository.project.manage';
      if (requireAction(actionId)) ports.openProjectDialog(action.id === 'create-project');
    },

    handleGlobalKeydown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (canExecute(saveState())) void ports.saveActiveTab();
      }
    },

    manageProjects() {
      if (requireAction('repository.project.manage')) ports.openProjectDialog(false);
    }
  };
}
