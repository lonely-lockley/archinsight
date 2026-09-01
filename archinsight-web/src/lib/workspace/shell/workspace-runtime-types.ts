import type { WorkspaceSurface } from '$lib/actions/action-model';
import type { AuthController } from '$lib/workspace/auth/auth-controller';
import type { DiagramController } from '$lib/workspace/diagram/diagram-controller';
import type { DownloadController } from '$lib/workspace/diagram/download-controller';
import type { WorkspaceFileController } from '$lib/workspace/editor/workspace-file-controller';
import type { ProjectDialogController } from '$lib/workspace/projects/project-dialog-controller';
import type { ProjectSessionController } from '$lib/workspace/projects/project-session-controller';
import type { RepositoryDialogController } from '$lib/workspace/repository/repository-dialog-controller';
import type { LayoutController } from '$lib/workspace/shell/layout-controller';
import type { WorkspaceActionController } from '$lib/workspace/shell/workspace-action-controller';
import type { WorkspaceRuntimeState } from '$lib/workspace/shell/workspace-runtime-state';
import type { TreeNode } from '$lib/workspace-types';

export type WorkspaceRuntimeHost = {
  surface(): WorkspaceSurface;
  state(): WorkspaceRuntimeState;
  patchState(patch: Partial<WorkspaceRuntimeState>): void;
  editorHost(): HTMLDivElement;
};

export type WorkspaceRuntimeControllers = {
  auth: AuthController;
  action: WorkspaceActionController;
  diagram: DiagramController;
  download: DownloadController;
  file: WorkspaceFileController;
  layout: LayoutController;
  projectDialog: ProjectDialogController;
  repositoryDialog: RepositoryDialogController;
};

export type WorkspaceRuntime = {
  authController: AuthController;
  actionController: WorkspaceActionController;
  diagramController: DiagramController;
  downloadController: DownloadController;
  fileController: WorkspaceFileController;
  layoutController: LayoutController;
  projectDialogController: ProjectDialogController;
  projectSession: ProjectSessionController;
  repositoryDialogController: RepositoryDialogController;
  controllers: WorkspaceRuntimeControllers;
  start(): Promise<void>;
  dispose(): void;
  openRepositoryMenu(node: TreeNode, event: MouseEvent): void;
  closeRepositoryMenu(): void;
};
