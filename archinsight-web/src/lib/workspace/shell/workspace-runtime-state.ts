import {
  coreLanguageSnapshot,
  type LanguageSnapshot,
  type LinkProjectResult
} from '@insight/language';
import type { AuthUserResponse, Diagnostic, ProjectStructure } from '$lib/api';
import type { ProjectRegistryState } from '$lib/storage';
import {
  emptyWorkspaceCompletionSnapshot,
  type WorkspaceCompletionSnapshot
} from '$lib/workspace-completion-snapshot';
import { emptyProjectSymbols } from '$lib/workspace/projects/project-session-controller';
import type { ProjectDialogState } from '$lib/workspace/projects/project-dialog-types';
import type {
  DeleteDialogState,
  FileDialogState
} from '$lib/workspace/repository/repository-dialog-types';
import { defaultProjectUi } from '$lib/workspace/shell/layout-model';
import type { MessageView, ProjectUiState, TreeNode, WorkspaceTab } from '@archinsight/workbench/types';
import {
  diagnosticErrorSources,
  diagnosticsHaveErrors
} from '$lib/workspace/analysis/diagnostics';

export type WorkspaceRuntimeState = {
  tree: TreeNode | undefined;
  projectSymbols: LanguageSnapshot;
  projectStructure: ProjectStructure | undefined;
  linkedAnalysis: LinkProjectResult | undefined;
  projectRegistry: ProjectRegistryState;
  activeProjectId: string | undefined;
  workspaceCompletionSnapshot: WorkspaceCompletionSnapshot;
  workspaceCompletionSnapshotRevision: number;
  editorSymbols: LanguageSnapshot;
  tabs: WorkspaceTab[];
  activeTabId: string | undefined;
  editorTabId: string | undefined;
  analysisLoading: boolean;
  refreshDisabled: boolean;
  localDiagnostics: Record<string, Diagnostic[]>;
  linkerDiagnostics: Record<string, Diagnostic[]>;
  overlays: Record<string, string>;
  projectUi: ProjectUiState;
  systemMessages: MessageView[];
  diagramVisibleScale: number;
  diagramVisibleScaleTabId: string | undefined;
  repositoryMenu: { node: TreeNode; x: number; y: number } | undefined;
  fileDialog: FileDialogState | undefined;
  deleteDialog: DeleteDialogState | undefined;
  projectDialog: ProjectDialogState | undefined;
  currentUser: AuthUserResponse;
  publishedProjectId: string | undefined;
  deploymentPickerOpen: boolean;
};

export function initialWorkspaceRuntimeState(): WorkspaceRuntimeState {
  return {
    tree: undefined,
    projectSymbols: emptyProjectSymbols(),
    projectStructure: undefined,
    linkedAnalysis: undefined,
    projectRegistry: { projects: [] },
    activeProjectId: undefined,
    workspaceCompletionSnapshot: emptyWorkspaceCompletionSnapshot,
    workspaceCompletionSnapshotRevision: 0,
    editorSymbols: coreLanguageSnapshot,
    tabs: [],
    activeTabId: undefined,
    editorTabId: undefined,
    analysisLoading: false,
    refreshDisabled: false,
    localDiagnostics: {},
    linkerDiagnostics: {},
    overlays: {},
    projectUi: defaultProjectUi(),
    systemMessages: [],
    diagramVisibleScale: 1,
    diagramVisibleScaleTabId: undefined,
    repositoryMenu: undefined,
    fileDialog: undefined,
    deleteDialog: undefined,
    projectDialog: undefined,
    currentUser: { authenticated: false },
    publishedProjectId: undefined,
    deploymentPickerOpen: false
  };
}

export function activeWorkspaceTab(state: WorkspaceRuntimeState): WorkspaceTab | undefined {
  return state.tabs.find((tab) => tab.id === state.activeTabId);
}

export function workspaceErrorSources(state: WorkspaceRuntimeState): Set<string> {
  return diagnosticErrorSources(state.localDiagnostics, state.linkerDiagnostics);
}

export function canDownloadWorkspaceDiagram(state: WorkspaceRuntimeState): boolean {
  const tab = activeWorkspaceTab(state);
  return tab !== undefined
    && tab.dot !== undefined
    && tab.svg.trim().length > 0
    && !diagnosticsHaveErrors(state.localDiagnostics)
    && !diagnosticsHaveErrors(state.linkerDiagnostics);
}
