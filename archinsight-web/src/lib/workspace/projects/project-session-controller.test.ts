import { describe, expect, it, vi } from 'vitest';
import type { ProjectSummary, WorkspaceTabState } from '$lib/storage';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import {
  createProjectSessionController,
  emptyProjectSymbols,
  type ProjectSessionControllerPorts,
  type ProjectSessionState
} from './project-session-controller';

const projects: ProjectSummary[] = [
  { id: 'one', name: 'One' },
  { id: 'two', name: 'Two' }
];

const workspaceTab = (state: WorkspaceTabState): WorkspaceTab => ({
  id: state.id,
  filePath: state.filePath,
  sourceIdentity: state.sourceIdentity ?? state.filePath ?? state.id,
  title: state.title,
  content: state.content ?? '',
  svg: '<svg/>', diagnostics: [], local: state.filePath === undefined,
  diagramMode: 'default', query: '', queryPreset: true, queryVisible: false,
  queryPanelHeight: 118, diagramScale: 1, diagramFit: false,
  viewMode: 'split', editorSplitRatio: 50
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function fixture(initial: Partial<ProjectSessionState> = {}) {
  let state: ProjectSessionState = {
    registry: { projects },
    activeProjectId: 'one',
    tree: undefined,
    projectSymbols: emptyProjectSymbols(),
    projectStructure: undefined,
    analysisLoading: false,
    overlays: {},
    publishedProjectId: undefined,
    ...initial
  };
  let tabs: WorkspaceTab[] = [];
  const ports: ProjectSessionControllerPorts = {
    surface: () => 'editor',
    readState: () => state,
    writeState: (next) => { state = next; },
    fetchProjects: vi.fn(async () => ({ projects })),
    fetchPublication: vi.fn(async () => ({ repositoryId: 'two' })),
    fetchTree: vi.fn(async (projectId) => ({
      root: { name: projectId, path: '', type: 'directory' as const, children: [] }
    })),
    readRegistry: vi.fn(() => ({ projects, activeProjectId: 'two' })),
    writeRegistry: vi.fn(),
    readWorkspace: vi.fn(() => ({ tabs: [] })),
    clearProjectStorage: vi.fn(),
    clearLocalWorkspaceStorage: vi.fn(),
    resetWorkspaceTools: vi.fn(() => { tabs = []; }),
    refreshEditorSymbols: vi.fn(),
    setProjectUi: vi.fn(),
    normalizeProjectUi: vi.fn(() => ({
      sidebarVisible: true, sidebarWidth: 300, messagesVisible: false, messagesHeight: 180
    })),
    restoreFileTab: vi.fn(async (tab) => { tabs.push(workspaceTab(tab)); }),
    restoreLocalTab: vi.fn((tab) => { tabs.push(workspaceTab(tab)); }),
    tabs: () => tabs,
    activateTab: vi.fn(async () => undefined),
    scheduleLink: vi.fn(),
    defer: vi.fn(async () => undefined),
    redirectIfAuthRequired: vi.fn(() => false),
    error: vi.fn()
  };
  const controller = createProjectSessionController(ports);
  return { ports, controller, state: () => state, tabs: () => tabs };
}

describe('project session controller', () => {
  it('restores the preferred project from the server-backed registry', async () => {
    const subject = fixture({ activeProjectId: undefined });
    await subject.controller.loadProjects();
    expect(subject.state().activeProjectId).toBe('two');
    expect(subject.ports.writeRegistry).toHaveBeenCalledWith({ projects, activeProjectId: 'two' });
  });

  it('resets workspace state when the repository has no projects', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.fetchProjects).mockResolvedValueOnce({ projects: [] });
    await subject.controller.loadProjects();
    expect(subject.state()).toMatchObject({ activeProjectId: undefined, tree: undefined, overlays: {} });
    expect(subject.ports.resetWorkspaceTools).toHaveBeenCalledOnce();
    expect(subject.ports.refreshEditorSymbols).toHaveBeenCalledOnce();
  });

  it('loads publication metadata independently from the active project', async () => {
    const subject = fixture();
    await subject.controller.loadPublication();
    expect(subject.state().publishedProjectId).toBe('two');
  });

  it('restores repository and unsaved tabs, then selects the stored active tab', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.readWorkspace).mockReturnValueOnce({
      tabs: [
        { id: 'main.ai', filePath: 'main.ai', title: 'main.ai' },
        { id: 'untitled:1', title: 'Untitled 1', content: 'draft' }
      ],
      activeTab: 'untitled:1',
      ui: { sidebarWidth: 420 }
    });
    await subject.controller.loadProject();

    expect(subject.ports.restoreFileTab).toHaveBeenCalledOnce();
    expect(subject.ports.restoreLocalTab).toHaveBeenCalledOnce();
    expect(subject.ports.activateTab).toHaveBeenCalledWith('untitled:1', expect.any(Object));
    expect(subject.ports.scheduleLink).toHaveBeenCalledWith(0);
    expect(subject.state().analysisLoading).toBe(true);
  });

  it('discards a tree response after the session generation changes', async () => {
    const subject = fixture();
    const pending = deferred<{ root: { name: string; path: string; type: 'directory'; children: [] } }>();
    vi.mocked(subject.ports.fetchTree).mockReturnValueOnce(pending.promise);
    const loading = subject.controller.loadProject();
    subject.controller.resetWorkspaceState();
    pending.resolve({ root: { name: 'stale', path: '', type: 'directory', children: [] } });
    await loading;
    expect(subject.state().tree).toBeUndefined();
    expect(subject.ports.scheduleLink).not.toHaveBeenCalled();
  });

  it('switches projects atomically and reloads after the render tick', async () => {
    const subject = fixture();
    await subject.controller.switchProject('two');
    expect(subject.ports.resetWorkspaceTools).toHaveBeenCalledOnce();
    expect(subject.ports.clearLocalWorkspaceStorage).toHaveBeenCalledOnce();
    expect(subject.ports.defer).toHaveBeenCalledOnce();
    expect(subject.ports.fetchTree).toHaveBeenCalledWith('two', 'editor');
    expect(subject.state().activeProjectId).toBe('two');
  });

  it('updates project metadata in both the registry and active tree', () => {
    const subject = fixture({
      tree: { name: 'Old', path: '', type: 'directory', children: [] }
    });
    subject.controller.acceptCreatedProject({ id: 'new', name: 'New' });
    subject.controller.acceptUpdatedProject({ id: 'one', name: 'Renamed' });
    expect(subject.state().registry.projects.map((project) => project.id)).toEqual(['new', 'one', 'two']);
    expect(subject.state().tree?.name).toBe('Renamed');
    expect(subject.ports.writeRegistry).toHaveBeenCalled();
  });

  it('clears the workspace after deleting the last active project', async () => {
    const subject = fixture({ registry: { projects: [projects[0]!] } });
    expect(await subject.controller.acceptDeletedProject('one')).toBe(0);
    expect(subject.ports.clearProjectStorage).toHaveBeenCalledWith('one');
    expect(subject.state()).toMatchObject({ activeProjectId: undefined, registry: { projects: [] } });
    expect(subject.ports.refreshEditorSymbols).toHaveBeenCalledOnce();
  });
});
