export type WorkspaceState = {
  tabs: WorkspaceTabState[];
  activeTab?: string;
  ui?: WorkspaceUiState;
};

export type ProjectRegistryState = {
  activeProjectId?: string;
  projects: ProjectSummary[];
};

export type ProjectSummary = {
  id: string;
  name: string;
  created?: string;
  updated?: string;
  fileCount?: number;
};

export type WorkspaceTabState = {
  id: string;
  filePath?: string;
  sourceIdentity?: string;
  title: string;
  content?: string;
  ui?: WorkspaceTabUiState;
  query?: string;
  queryPreset?: boolean;
  diagramMode?: string;
  deploymentEnvironment?: string;
  queryVisible?: boolean;
  queryPanelHeight?: number;
  diagramScale?: number;
  diagramFit?: boolean;
  viewMode?: string;
  editorSplitRatio?: number;
};

export type WorkspaceUiState = {
  sidebarVisible?: boolean;
  sidebarWidth?: number;
  messagesVisible?: boolean;
  messagesHeight?: number;
};

export type WorkspaceTabUiState = WorkspaceUiState;

export function readWorkspace(projectId: string): WorkspaceState {
  const state = readJson<StoredWorkspaceState>(workspaceKey(projectId));
  if (state === undefined) {
    return { tabs: [] };
  }
  return {
    tabs: state.tabs.map(normalizeWorkspaceTab),
    activeTab: state.activeTab,
    ui: state.ui
  };
}

export function writeWorkspace(projectId: string, state: WorkspaceState): void {
  localStorage.setItem(workspaceKey(projectId), JSON.stringify(state));
}

export function readProjectRegistry(): ProjectRegistryState {
  const state = readJson<ProjectRegistryState>(projectRegistryKey());
  if (state === undefined) {
    return { projects: [] };
  }
  return {
    activeProjectId: typeof state.activeProjectId === 'string' ? state.activeProjectId : undefined,
    projects: Array.isArray(state.projects)
      ? state.projects.filter(isProjectSummary)
      : []
  };
}

export function writeProjectRegistry(state: ProjectRegistryState): void {
  localStorage.setItem(projectRegistryKey(), JSON.stringify(state));
}

export function rememberProject(project: ProjectSummary): ProjectRegistryState {
  const registry = readProjectRegistry();
  const projects = [
    project,
    ...registry.projects.filter((item) => item.id !== project.id)
  ];
  const next = {
    activeProjectId: project.id,
    projects
  };
  writeProjectRegistry(next);
  return next;
}

export function readLocalSource(projectId: string, path: string): string | undefined {
  return localStorage.getItem(sourceKey(projectId, path))
    ?? localStorage.getItem(legacyFileKey(projectId, path))
    ?? undefined;
}

export function writeLocalSource(projectId: string, path: string, content: string): void {
  localStorage.setItem(sourceKey(projectId, path), content);
  localStorage.setItem(sourceUpdatedAtKey(projectId, path), String(Date.now()));
}

export function removeLocalSource(projectId: string, path: string): void {
  localStorage.removeItem(sourceKey(projectId, path));
  localStorage.removeItem(sourceUpdatedAtKey(projectId, path));
  localStorage.removeItem(legacyFileKey(projectId, path));
  localStorage.removeItem(legacyFileUpdatedAtKey(projectId, path));
}

export function clearLocalWorkspaceStorage(): void {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => key !== null && key.startsWith('insight:'));
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

export function clearProjectStorage(projectId: string): void {
  const prefix = `insight:${projectId}:`;
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    .filter((key): key is string => key !== null && key.startsWith(prefix));
  for (const key of keys) localStorage.removeItem(key);
}

export function hasLocalSource(projectId: string, path: string): boolean {
  return localStorage.getItem(sourceKey(projectId, path)) !== null
    || localStorage.getItem(legacyFileKey(projectId, path)) !== null;
}

type StoredWorkspaceState = {
  tabs: Array<string | WorkspaceTabState>;
  activeTab?: string;
  ui?: WorkspaceUiState;
};

function normalizeWorkspaceTab(tab: string | WorkspaceTabState): WorkspaceTabState {
  if (typeof tab === 'string') {
    return {
      id: tab,
      filePath: tab,
      sourceIdentity: tab,
      title: tab.split('/').at(-1) ?? tab
    };
  }
  if (tab.sourceIdentity === undefined && tab.filePath !== undefined) {
    return {
      ...tab,
      sourceIdentity: tab.filePath
    };
  }
  return tab;
}

function readJson<T>(key: string): T | undefined {
  const value = localStorage.getItem(key);
  if (value === null) {
    return undefined;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function workspaceKey(projectId: string): string {
  return `insight:${projectId}:workspace`;
}

function projectRegistryKey(): string {
  return 'insight:projects';
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  return typeof value === 'object'
    && value !== null
    && typeof (value as ProjectSummary).id === 'string'
    && typeof (value as ProjectSummary).name === 'string';
}

function sourceKey(projectId: string, path: string): string {
  return `insight:${projectId}:source:${path}:content`;
}

function sourceUpdatedAtKey(projectId: string, path: string): string {
  return `insight:${projectId}:source:${path}:updatedAt`;
}

function legacyFileKey(projectId: string, path: string): string {
  return `insight:${projectId}:file:${path}:content`;
}

function legacyFileUpdatedAtKey(projectId: string, path: string): string {
  return `insight:${projectId}:file:${path}:updatedAt`;
}
