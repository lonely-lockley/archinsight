import type { ProjectSummary } from './storage';

export type EmptyWorkspaceActionId = 'create-project' | 'create-tab' | 'manage-projects';

export type EmptyWorkspaceAction = {
  id: EmptyWorkspaceActionId;
  label: string;
  icon: string;
  primary?: boolean;
  disabled?: boolean;
  reason?: string;
};

export type EmptyWorkspaceStrategy = {
  kind: 'no-projects' | 'active-project' | 'no-active-project';
  actions: EmptyWorkspaceAction[];
};

export function emptyWorkspaceStrategy(
  projects: ProjectSummary[],
  activeProjectId: string | undefined
): EmptyWorkspaceStrategy {
  if (projects.length === 0) {
    return {
      kind: 'no-projects',
      actions: [{ id: 'create-project', label: 'Create project', icon: 'repo-create', primary: true }]
    };
  }
  if (activeProjectId !== undefined && projects.some((project) => project.id === activeProjectId)) {
    return {
      kind: 'active-project',
      actions: [
        { id: 'create-tab', label: 'Create New Tab', icon: 'new-file', primary: true },
        { id: 'manage-projects', label: 'Manage Projects', icon: 'folder-library' }
      ]
    };
  }
  return {
    kind: 'no-active-project',
    actions: [{ id: 'manage-projects', label: 'Manage Projects', icon: 'folder-library', primary: true }]
  };
}
