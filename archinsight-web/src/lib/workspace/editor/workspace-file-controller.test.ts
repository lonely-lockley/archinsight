import { describe, expect, it, vi } from 'vitest';
import type { AnalysisController } from '../analysis/analysis-controller';
import type { MonacoSession } from './monaco-session';
import { createTabController } from './tab-controller';
import type { WorkspaceTab } from '$lib/workspace-types';
import {
  createWorkspaceFileController,
  nextUntitledCounter,
  type WorkspaceFileControllerPorts
} from './workspace-file-controller';

const tab = (id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id, filePath: id, sourceIdentity: id, title: id, content: `${id} content`, svg: '<svg/>',
  diagnostics: [], local: false, diagramMode: 'default', query: '', queryPreset: true,
  queryVisible: false, queryPanelHeight: 118, diagramScale: 1, diagramFit: false,
  viewMode: 'split', editorSplitRatio: 50, ...overrides
});

function fixture(initialTabs: WorkspaceTab[] = []) {
  let tabs = initialTabs;
  let activeTabId: string | undefined = initialTabs[0]?.id;
  let editorTabId: string | undefined = activeTabId;
  let overlays: Record<string, string> = {};
  let tree = { name: 'project', path: '', type: 'directory' as const, children: [] };
  const tabController = createTabController({
    readState: () => ({ tabs, activeTabId, editorTabId }),
    writeState: (state) => {
      tabs = state.tabs;
      activeTabId = state.activeTabId;
      editorTabId = state.editorTabId;
    }
  });
  const monaco: MonacoSession = {
    startLanguageWorker: vi.fn(), setupEditor: vi.fn(async () => undefined),
    checkSyntax: vi.fn(async () => []), syncActiveTab: vi.fn(), ensureModel: vi.fn(),
    removeModel: vi.fn(), retargetModel: vi.fn(), reveal: vi.fn(),
    refreshTokenVocabulary: vi.fn(), refreshMarkers: vi.fn(), layout: vi.fn(),
    reset: vi.fn(), dispose: vi.fn()
  };
  const analysis: AnalysisController = {
    scheduleLink: vi.fn(), scheduleDiagramUpdate: vi.fn(), scheduleLiveSyntaxCheck: vi.fn(),
    isCurrentLink: vi.fn(() => true), updateLinkerDiagnostics: vi.fn(),
    updateLocalDiagnostics: vi.fn(), removeDiagnostics: vi.fn(), diagnosticsFor: vi.fn(() => []),
    reset: vi.fn(), dispose: vi.fn()
  };
  const ports: WorkspaceFileControllerPorts = {
    surface: () => 'editor',
    projectId: () => 'project',
    storageProjectId: () => 'project',
    activeProjectId: () => 'project',
    tabs: () => tabs,
    activeTab: () => tabs.find((item) => item.id === activeTabId),
    activeTabId: () => activeTabId,
    overlays: () => overlays,
    setOverlays: (next) => { overlays = next; },
    projectUi: () => ({ sidebarVisible: true, sidebarWidth: 300, messagesVisible: false, messagesHeight: 180 }),
    tree: () => tree,
    setTree: (next) => { tree = next as typeof tree; },
    tabController,
    monacoSession: () => monaco,
    analysisController: () => analysis,
    fetchFile: vi.fn(async (_projectId, path) => ({ content: `server:${path}` })),
    saveFile: vi.fn(async (_projectId, path) => ({ path })),
    fetchTree: vi.fn(async () => ({ root: tree })),
    readLocalSource: vi.fn(() => undefined),
    hasLocalSource: vi.fn(() => false),
    writeLocalSource: vi.fn(),
    removeLocalSource: vi.fn(),
    writeWorkspace: vi.fn(),
    authorizeNewTab: vi.fn(() => true),
    authorizeSave: vi.fn(() => true),
    openFileDialog: vi.fn(),
    coreSource: (sourceIdentity) => `core:${sourceIdentity}`,
    coreSourceExists: (sourceIdentity) => sourceIdentity === 'core.ai',
    coreSourceIdentity: () => 'core.ai',
    readonlyCoreTabId: (sourceIdentity) => `readonly:${sourceIdentity}`,
    currentProjectLoad: vi.fn(() => true),
    setDeploymentPickerOpen: vi.fn(),
    refreshEditorTokenVocabulary: vi.fn(),
    defer: vi.fn(async () => undefined),
    redirectIfAuthRequired: vi.fn(() => false),
    info: vi.fn(),
    error: vi.fn(),
    fileSaved: vi.fn()
  };
  return {
    ports, monaco, analysis,
    controller: createWorkspaceFileController(ports),
    tabs: () => tabs,
    activeTabId: () => activeTabId,
    overlays: () => overlays
  };
}

describe('workspace file controller', () => {
  it('accepts editor changes into overlays, storage, analysis, and workspace state', () => {
    const main = tab('main.ai');
    const subject = fixture([main]);
    subject.controller.contentChanged(main, 'changed');
    expect(subject.tabs()[0]).toMatchObject({ content: 'changed', local: true, dot: undefined });
    expect(subject.overlays()).toEqual({ 'main.ai': 'changed' });
    expect(subject.ports.writeLocalSource).toHaveBeenCalledWith('project', 'main.ai', 'changed');
    expect(subject.analysis.scheduleLink).toHaveBeenCalled();
    expect(subject.ports.writeWorkspace).toHaveBeenCalled();
  });

  it('opens a server file, creates its Monaco model, and schedules rendering', async () => {
    const subject = fixture();
    await subject.controller.openFile('domain/main.ai');
    expect(subject.ports.fetchFile).toHaveBeenCalledWith('project', 'domain/main.ai', 'editor');
    expect(subject.monaco.ensureModel).toHaveBeenCalledWith('domain/main.ai', 'server:domain/main.ai');
    expect(subject.tabs()[0]).toMatchObject({ id: 'domain/main.ai', local: false });
    expect(subject.activeTabId()).toBe('domain/main.ai');
    expect(subject.analysis.scheduleLiveSyntaxCheck).toHaveBeenCalled();
  });

  it('prefers local content and restores it as a semantic overlay', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.readLocalSource).mockReturnValueOnce('local');
    vi.mocked(subject.ports.hasLocalSource).mockReturnValueOnce(true);
    await subject.controller.openFile('main.ai', false);
    expect(subject.ports.fetchFile).not.toHaveBeenCalled();
    expect(subject.overlays()).toEqual({ 'main.ai': 'local' });
    expect(subject.analysis.scheduleLink).toHaveBeenCalled();
  });

  it('drops a restored file when its project load guard becomes stale', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.currentProjectLoad).mockReturnValueOnce(false);
    await subject.controller.openFile('main.ai', false, false, undefined, undefined, {
      projectId: 'project', storageProjectId: 'project', generation: 1
    });
    expect(subject.ports.fetchFile).not.toHaveBeenCalled();
    expect(subject.tabs()).toEqual([]);
  });

  it('creates unique untitled tabs after restoring a previous counter', async () => {
    const subject = fixture();
    subject.controller.restoreLocalTab({ id: 'untitled:4', title: 'Untitled 4', content: 'draft' });
    await subject.controller.newFile();
    expect(subject.tabs().map((item) => item.id)).toEqual(['untitled:4', 'untitled:5']);
    expect(subject.monaco.ensureModel).toHaveBeenCalledWith('untitled:4', 'draft');
  });

  it('opens core declarations read-only and reveals the requested location', async () => {
    const subject = fixture();
    await subject.controller.goToDeclaration({ source: 'core.ai', line: 2, column: 3 });
    expect(subject.tabs()[0]).toMatchObject({ id: 'readonly:core.ai', readOnly: true, projectSource: false });
    expect(subject.monaco.reveal).toHaveBeenCalledWith({ source: 'core.ai', line: 2, column: 3 });
  });

  it('closes an active overlay tab and forces relinking', () => {
    const main = tab('main.ai', { local: true });
    const subject = fixture([main]);
    subject.ports.setOverlays({ 'main.ai': 'changed' });
    subject.controller.closeTab('main.ai');
    expect(subject.tabs()).toEqual([]);
    expect(subject.monaco.removeModel).toHaveBeenCalledWith('main.ai');
    expect(subject.analysis.removeDiagnostics).toHaveBeenCalledWith(['main.ai']);
    expect(subject.analysis.scheduleLink).toHaveBeenCalled();
  });

  it('opens save-as for unsaved tabs and persists repository tabs directly', async () => {
    const unsaved = tab('untitled:1', { filePath: undefined, title: 'Untitled 1' });
    const saveAs = fixture([unsaved]);
    await saveAs.controller.saveActiveTab();
    expect(saveAs.ports.openFileDialog).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'save', fileName: 'untitled', tabId: 'untitled:1'
    }));

    const saved = fixture([tab('main.ai', { local: true })]);
    await saved.controller.saveActiveTab();
    expect(saved.ports.saveFile).toHaveBeenCalledWith('project', 'main.ai', { content: 'main.ai content' });
    expect(saved.tabs()[0]?.local).toBe(false);
    expect(saved.ports.fileSaved).toHaveBeenCalledWith('main.ai');
  });

  it('retargets open tabs for file and folder rename effects', async () => {
    const subject = fixture([
      tab('domain/a.ai', { local: true }),
      tab('domain/nested/b.ai')
    ]);
    await subject.controller.acceptFileEffect({
      kind: 'file-renamed', sourcePath: 'domain/a.ai', path: 'domain/c.ai'
    });
    await subject.controller.acceptFileEffect({
      kind: 'folder-renamed', sourcePath: 'domain', path: 'renamed'
    });
    expect(subject.tabs().map((item) => item.filePath)).toEqual([
      'renamed/c.ai', 'renamed/nested/b.ai'
    ]);
    expect(subject.monaco.retargetModel).toHaveBeenCalled();
  });

  it('removes deleted files from tabs, overlays, storage, and diagnostics', async () => {
    const subject = fixture([tab('main.ai')]);
    subject.ports.setOverlays({ 'main.ai': 'changed' });
    await subject.controller.acceptDeletedFiles(['main.ai']);
    expect(subject.tabs()).toEqual([]);
    expect(subject.overlays()).toEqual({});
    expect(subject.ports.removeLocalSource).toHaveBeenCalledWith('project', 'main.ai');
    expect(subject.analysis.removeDiagnostics).toHaveBeenCalledWith(['main.ai']);
  });

  it('computes the next untitled counter from either persisted identity', () => {
    expect(nextUntitledCounter('untitled:8', 'Draft')).toBe(9);
    expect(nextUntitledCounter('custom', 'Untitled 3')).toBe(4);
    expect(nextUntitledCounter('custom', 'Draft')).toBe(1);
  });
});
