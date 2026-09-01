import type { DeploymentEnvironment } from '@insight/language';
import { routePath } from '$lib/api';
import type { EmptyWorkspaceStrategy } from '$lib/empty-workspace-strategy';
import type { ProjectSummary } from '$lib/storage';
import type { AuthController } from '$lib/workspace/auth/auth-controller';
import type { DiagramController } from '$lib/workspace/diagram/diagram-controller';
import type { DownloadController } from '$lib/workspace/diagram/download-controller';
import type { WorkspaceFileController } from '$lib/workspace/editor/workspace-file-controller';
import type { ProjectDialogController } from '$lib/workspace/projects/project-dialog-controller';
import type { RepositoryDialogController } from '$lib/workspace/repository/repository-dialog-controller';
import { repositoryDirectories } from '$lib/workspace/repository/repository-tree';
import type { LayoutController } from '$lib/workspace/shell/layout-controller';
import type {
  RepositoryActionStates,
  WorkspaceActionController
} from '$lib/workspace/shell/workspace-action-controller';
import type { WorkspaceRuntime } from '$lib/workspace/shell/workspace-runtime-types';
import {
  activeWorkspaceTab,
  canDownloadWorkspaceDiagram,
  workspaceErrorSources,
  type WorkspaceRuntimeState
} from '$lib/workspace/shell/workspace-runtime-state';
import type { WorkspaceSurface } from '$lib/actions/action-model';

export type WorkspaceShellView = {
  surface: WorkspaceSurface;
  state: WorkspaceRuntimeState;
  activeTab: ReturnType<typeof activeWorkspaceTab>;
  activeDeploymentEnvironments: readonly DeploymentEnvironment[];
  errorSourceIdentities: Set<string>;
  emptyStrategy: EmptyWorkspaceStrategy;
  canDownloadCurrentDiagram: boolean;
  newTabState: ReturnType<WorkspaceActionController['newTabState']>;
  saveState: ReturnType<WorkspaceActionController['saveState']>;
  repositoryMenuActions: RepositoryActionStates;
  publicationFormState: ReturnType<WorkspaceActionController['publicationState']>;
  repositoryDirectoryOptions: ReturnType<typeof repositoryDirectories>;
  editorHref: string;
  loginHref: string;
};

export type WorkspaceShellControllers = {
  auth: AuthController;
  action: WorkspaceActionController;
  diagram: DiagramController;
  download: DownloadController;
  file: WorkspaceFileController;
  layout: LayoutController;
  projectDialog: ProjectDialogController;
  repositoryDialog: RepositoryDialogController;
};

export function createWorkspaceShellView(
  surface: WorkspaceSurface,
  state: WorkspaceRuntimeState,
  runtime: WorkspaceRuntime
): WorkspaceShellView {
  const activeTab = activeWorkspaceTab(state);
  return {
    surface,
    state,
    activeTab,
    activeDeploymentEnvironments: runtime.diagramController.deploymentEnvironmentsFor(
      activeTab,
      state.linkedAnalysis
    ),
    errorSourceIdentities: workspaceErrorSources(state),
    emptyStrategy: runtime.actionController.emptyStrategy(),
    canDownloadCurrentDiagram: canDownloadWorkspaceDiagram(state),
    newTabState: runtime.actionController.newTabState(),
    saveState: runtime.actionController.saveState(),
    repositoryMenuActions: runtime.actionController.repositoryStates(),
    publicationFormState: runtime.actionController.publicationState(),
    repositoryDirectoryOptions: repositoryDirectories(state.tree),
    editorHref: routePath('/editor'),
    loginHref: routePath('/login')
  };
}
