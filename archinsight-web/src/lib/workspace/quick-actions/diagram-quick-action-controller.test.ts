import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildLanguageSnapshotResultFromSources,
  coreLanguageSnapshot,
  linkProject,
  type LinkProjectResult
} from '@insight/language';
import {
  idleFindPathMode,
  idleIsolateMode,
  type FindPathMode,
  type IsolateMode
} from '@archinsight/workbench/diagram-quick-actions';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import { createDiagramQuickActionController } from './diagram-quick-action-controller';

let analysis: LinkProjectResult;
let scaleAnalysis: LinkProjectResult;

beforeAll(() => {
  const snapshot = buildLanguageSnapshotResultFromSources([{
    sourceName: 'definitions.ai',
    source: `
define type AppEnvironment of Environment
    Compute compute
`
  }], [coreLanguageSnapshot]).snapshot;
  analysis = linkProject({
    snapshot,
    sources: [
      {
        sourceName: 'eu.ai',
        source: `
environment eu
    name = Europe

deployment production
    compute:
        compute node
            name = EU node
`
      },
      {
        sourceName: 'us.ai',
        source: `
environment us
    name = United States

deployment production
    compute:
        compute node
            name = US node
`
      },
      {
      sourceName: 'model.ai',
      source: `
context shop

deploymentProfile multiRegion
    appliesTo:
        production from eu
        production from us
    runsOn compute

deploymentProfile europeOnly
    appliesTo:
        production from eu
    runsOn compute

system storefront
    name = Storefront
    service api
        name = API
        deployment:
            uses multiRegion
        component worker
            name = Worker
        links:
            -> database

    service database
        name = Database
        deployment:
            uses europeOnly

    service isolated
        name = Isolated
`
      }
    ]
  });
  scaleAnalysis = linkProject({
    snapshot: coreLanguageSnapshot,
    sources: [{
      sourceName: 'scale.ai',
      source: `
context demo

external actor user
    name = User
    links:
        -> ui from demo
        -> oidc from demo

external system google
    name = Google

system editor
    name = Editor
    container web
        name = Web
        component ui
            name = UI
            links:
                -> oidc
        component oidc
            name = OIDC
            links:
                -> google from demo
`
    }]
  });
});

function tab(): WorkspaceTab {
  return {
    id: 'tab-1', sourceIdentity: 'model.ai', filePath: 'model.ai', title: 'model.ai', content: '',
    svg: '<svg/>', diagnostics: [], local: false, diagramMode: 'default', query: '', queryPreset: true,
    queryVisible: false, diagramScale: 1, diagramFit: false, viewMode: 'diagram', editorSplitRatio: 50,
    queryPanelHeight: 118
  };
}

function subject() {
  let mode: FindPathMode = idleFindPathMode;
  let isolateMode: IsolateMode = idleIsolateMode;
  let pendingDeployment: string | undefined;
  let loading = false;
  let currentTab = tab();
  let currentAnalysis = analysis;
  const ports = {
    analysis: () => currentAnalysis,
    activeTab: () => currentTab,
    projectId: () => 'project',
    surface: () => 'editor' as const,
    theme: () => 'dark' as const,
    findPathMode: () => mode,
    setFindPathMode: vi.fn((next: FindPathMode) => { mode = next; }),
    isolateMode: () => isolateMode,
    setIsolateMode: vi.fn((next: IsolateMode) => { isolateMode = next; }),
    pendingDeploymentElementId: () => pendingDeployment,
    setPendingDeploymentElementId: vi.fn((next: string | undefined) => { pendingDeployment = next; }),
    setDeploymentPickerOpen: vi.fn(),
    setLoading: vi.fn((next: boolean) => { loading = next; }),
    patchTab: vi.fn(),
    renderInBrowser: vi.fn(async (renders) => ({
      diagnostics: [],
      svgs: [{ sourceIdentity: renders[0]!.sourceIdentity, diagram: 'query', svg: '<svg>quick</svg>' }]
    })),
    renderOnServer: vi.fn(),
    goToDeclaration: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  };
  return {
    controller: createDiagramQuickActionController(ports),
    ports,
    mode: () => mode,
    isolateMode: () => isolateMode,
    loading: () => loading,
    setActiveTab: (next: WorkspaceTab) => { currentTab = next; },
    setAnalysis: (next: LinkProjectResult) => { currentAnalysis = next; }
  };
}

describe('diagram quick action controller', () => {
  it('isolates the selected element and its direct neighborhood at the current scale', async () => {
    const test = subject();
    await test.controller.execute('isolate', 'shop/api');
    expect(test.ports.renderInBrowser).toHaveBeenCalledOnce();
    expect(test.ports.patchTab).toHaveBeenCalledWith('tab-1', {
      svg: '<svg>quick</svg>', dot: expect.stringContaining('shop/database'), queryResult: undefined
    });
    const dot = test.ports.renderInBrowser.mock.calls[0]?.[0]?.[0]?.dot ?? '';
    expect(dot).toContain('rankdir=LR');
    expect(dot).not.toContain('subgraph cluster_');
    expect(dot).not.toContain('shop/worker');
    expect(dot).not.toContain('shop/isolated');
    expect(test.isolateMode()).toEqual({
      status: 'showing-isolate', elementId: 'shop/api', elementTitle: 'API'
    });
    expect(test.loading()).toBe(false);

    test.controller.cancelIsolate();
    expect(test.isolateMode()).toEqual({ status: 'idle' });
    expect(test.ports.patchTab).toHaveBeenLastCalledWith('tab-1', {
      svg: '<svg/>', dot: undefined, queryResult: undefined
    });
  });

  it('keeps the original diagram when another element is isolated before Back', async () => {
    const test = subject();
    await test.controller.execute('isolate', 'shop/api');
    await test.controller.execute('isolate', 'shop/database');

    expect(test.isolateMode()).toEqual({
      status: 'showing-isolate', elementId: 'shop/database', elementTitle: 'Database'
    });
    test.controller.cancelIsolate();

    expect(test.ports.patchTab).toHaveBeenLastCalledWith('tab-1', {
      svg: '<svg/>', dot: undefined, queryResult: undefined
    });
  });

  it('restores an isolated diagram before entering Find path', async () => {
    const test = subject();
    await test.controller.execute('isolate', 'shop/api');

    await test.controller.execute('find-path', 'shop/api');

    expect(test.isolateMode()).toEqual({ status: 'idle' });
    expect(test.mode()).toEqual({ status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API' });
    expect(test.ports.patchTab).toHaveBeenLastCalledWith('tab-1', {
      svg: '<svg/>', dot: undefined, queryResult: undefined
    });
  });

  it('moves go to declaration behind the explicit menu action', async () => {
    const test = subject();
    await test.controller.execute('go-to-declaration', 'shop/api');
    const declaration = analysis.elements.find((element) => element.id === 'shop/api')!.declaration!;
    expect(test.ports.goToDeclaration).toHaveBeenCalledWith({
      source: declaration.sourceName, line: declaration.line, column: declaration.column
    });
    expect(test.ports.renderInBrowser).not.toHaveBeenCalled();
  });

  it('uses the existing deployment picker when several environments are relevant', async () => {
    const test = subject();

    await test.controller.execute('show-deployment', 'shop/api');

    expect(test.ports.setPendingDeploymentElementId).toHaveBeenCalledWith('shop/api');
    expect(test.ports.setDeploymentPickerOpen).toHaveBeenCalledWith(true);
    expect(test.controller.deploymentEnvironments().map((environment) => environment.id)).toEqual(['eu', 'us']);
    expect(test.ports.renderInBrowser).not.toHaveBeenCalled();

    await test.controller.selectDeploymentEnvironment('us');
    expect(test.ports.renderInBrowser).toHaveBeenCalledOnce();
    expect(test.ports.setDeploymentPickerOpen).toHaveBeenLastCalledWith(false);
  });

  it('automatically renders deployment when exactly one environment is relevant', async () => {
    const test = subject();

    await test.controller.execute('show-deployment', 'shop/database');

    expect(test.ports.renderInBrowser).toHaveBeenCalledOnce();
    expect(test.ports.setDeploymentPickerOpen).not.toHaveBeenCalledWith(true);
  });

  it('keeps find path global until a target is selected and renders the path', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/api');
    expect(test.mode()).toEqual({ status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API' });
    await test.controller.selectPathTarget('shop/database');
    expect(test.mode()).toEqual({
      status: 'showing-path', sourceId: 'shop/api', sourceTitle: 'API',
      targetId: 'shop/database', targetTitle: 'Database'
    });
    expect(test.ports.patchTab).toHaveBeenCalledWith('tab-1', expect.objectContaining({
      dot: expect.stringContaining('shop/database')
    }));
    test.controller.cancelFindPath();
    expect(test.mode()).toEqual({ status: 'idle' });
    expect(test.ports.patchTab).toHaveBeenLastCalledWith('tab-1', {
      svg: '<svg/>', dot: undefined, queryResult: undefined
    });
  });

  it('reverses source and target while retaining the original diagram for Back', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/api');
    await test.controller.selectPathTarget('shop/database');

    await test.controller.reverseFindPath();

    expect(test.mode()).toEqual({
      status: 'showing-path',
      sourceId: 'shop/database',
      sourceTitle: 'Database',
      targetId: 'shop/api',
      targetTitle: 'API'
    });
    expect(test.ports.info).toHaveBeenCalledWith('No path found between Database and API.');
    expect(test.ports.renderInBrowser).toHaveBeenCalledTimes(2);

    await test.controller.reverseFindPath();
    expect(test.mode()).toEqual({
      status: 'showing-path',
      sourceId: 'shop/api',
      sourceTitle: 'API',
      targetId: 'shop/database',
      targetTitle: 'Database'
    });
    expect(test.ports.renderInBrowser).toHaveBeenCalledTimes(3);

    test.controller.cancelFindPath();
    expect(test.ports.patchTab).toHaveBeenLastCalledWith('tab-1', {
      svg: '<svg/>', dot: undefined, queryResult: undefined
    });
  });

  it('keeps every directed alternative on the active C3 scale instead of using only the C1 shortcut', async () => {
    const test = subject();
    test.setAnalysis(scaleAnalysis);
    test.setActiveTab({ ...tab(), sourceIdentity: 'scale.ai', diagramMode: 'c3' });

    await test.controller.execute('find-path', 'demo/user');
    await test.controller.selectPathTarget('demo/google');

    const dot = test.ports.renderInBrowser.mock.calls[0]?.[0]?.[0]?.dot ?? '';
    expect(dot).toContain('"demo/ui"');
    expect(dot).toContain('"demo/oidc"');
    expect(dot).not.toContain('"demo/editor" [');
  });

  it('does not traverse an incoming relationship against its direction', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/database');

    await test.controller.selectPathTarget('shop/api');

    expect(test.mode()).toEqual({
      status: 'showing-path', sourceId: 'shop/database', sourceTitle: 'Database',
      targetId: 'shop/api', targetTitle: 'API'
    });
    expect(test.ports.patchTab).toHaveBeenCalledWith('tab-1', expect.objectContaining({
      dot: expect.stringContaining('shop/database')
    }));
    expect(test.ports.info).toHaveBeenCalledWith('No path found between Database and API.');
  });

  it('keeps target selection active while the user changes diagram tabs', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/api');
    test.setActiveTab({ ...tab(), id: 'tab-2', title: 'Second diagram' });

    await test.controller.selectPathTarget('shop/database');

    expect(test.mode().status).toBe('showing-path');
    expect(test.ports.patchTab).toHaveBeenCalledWith('tab-2', expect.objectContaining({
      dot: expect.stringContaining('shop/database')
    }));
  });

  it('renders both endpoints when the elements are disconnected', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/database');
    await test.controller.selectPathTarget('shop/isolated');
    expect(test.mode()).toEqual({
      status: 'showing-path',
      sourceId: 'shop/database',
      sourceTitle: 'Database',
      targetId: 'shop/isolated',
      targetTitle: 'Isolated'
    });
    expect(test.ports.info).toHaveBeenCalledWith('No path found between Database and Isolated.');
    expect(test.ports.renderInBrowser).toHaveBeenCalledOnce();
    expect(test.ports.patchTab).toHaveBeenCalledWith('tab-1', expect.objectContaining({
      dot: expect.stringContaining('shop/isolated')
    }));
  });

  it('cancels selection when relinking removes its source', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/api');
    test.controller.reconcileAnalysis({ ...analysis, elements: analysis.elements.filter((element) => element.id !== 'shop/api') });
    expect(test.mode()).toEqual({ status: 'idle' });
    expect(test.ports.info).toHaveBeenCalledWith('Find path was cancelled because the source element is no longer available');
  });

  it('allows repeated cancellation without changing the current diagram', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/api');

    test.controller.cancelFindPath();
    test.controller.cancelFindPath();

    expect(test.mode()).toEqual({ status: 'idle' });
    expect(test.ports.patchTab).not.toHaveBeenCalled();
  });

  it('does not clear loading owned by normal analysis while cancelling target selection', async () => {
    const test = subject();
    test.ports.setLoading(true);
    await test.controller.execute('find-path', 'shop/api');

    test.controller.cancelFindPath();

    expect(test.mode()).toEqual({ status: 'idle' });
    expect(test.loading()).toBe(true);
  });

  it('cancels an active mode with a message when the project changes', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/api');

    test.controller.reset('project-change');

    expect(test.mode()).toEqual({ status: 'idle' });
    expect(test.ports.info).toHaveBeenCalledWith('Find path was cancelled because the project changed');
  });

  it('returns to target selection when path rendering fails', async () => {
    const test = subject();
    test.setAnalysis({
      ...analysis,
      diagnostics: [{ code: 'TEST_ERROR', sourceName: 'model.ai', line: 1, column: 1, message: 'invalid model' }]
    });
    await test.controller.execute('find-path', 'shop/api');

    await test.controller.selectPathTarget('shop/database');

    expect(test.mode()).toEqual({ status: 'selecting-target', sourceId: 'shop/api', sourceTitle: 'API' });
    expect(test.ports.error).toHaveBeenCalledWith('Find path failed: Cannot render invalid link result');
    expect(test.ports.patchTab).not.toHaveBeenCalled();
  });

  it('cancels a shown path when relinking removes its target', async () => {
    const test = subject();
    await test.controller.execute('find-path', 'shop/api');
    await test.controller.selectPathTarget('shop/database');

    test.controller.reconcileAnalysis({
      ...analysis,
      elements: analysis.elements.filter((element) => element.id !== 'shop/database')
    });

    expect(test.mode()).toEqual({ status: 'idle' });
    expect(test.ports.info).toHaveBeenCalledWith(
      'Find path was cancelled because the target element is no longer available'
    );
  });

  it('does not publish a pending path after its target disappears', async () => {
    const test = subject();
    let resolveRender!: (value: {
      diagnostics: never[];
      svgs: { sourceIdentity: string; diagram: 'query'; svg: string }[];
    }) => void;
    test.ports.renderInBrowser.mockImplementationOnce(() => new Promise((resolve) => { resolveRender = resolve; }));
    await test.controller.execute('find-path', 'shop/api');

    const pending = test.controller.selectPathTarget('shop/database');
    test.controller.reconcileAnalysis({
      ...analysis,
      elements: analysis.elements.filter((element) => element.id !== 'shop/database')
    });
    resolveRender({
      diagnostics: [],
      svgs: [{ sourceIdentity: 'model.ai', diagram: 'query', svg: '<svg>stale path</svg>' }]
    });
    await pending;

    expect(test.mode()).toEqual({ status: 'idle' });
    expect(test.ports.patchTab).not.toHaveBeenCalled();
    expect(test.ports.info).toHaveBeenCalledWith(
      'Find path was cancelled because the target element is no longer available'
    );
  });

  it('does not publish an older quick-action render after a newer one completes', async () => {
    const test = subject();
    let resolveFirst!: (value: {
      diagnostics: never[];
      svgs: { sourceIdentity: string; diagram: 'query'; svg: string }[];
    }) => void;
    const firstRender = new Promise<{
      diagnostics: never[];
      svgs: { sourceIdentity: string; diagram: 'query'; svg: string }[];
    }>((resolve) => { resolveFirst = resolve; });
    test.ports.renderInBrowser
      .mockImplementationOnce(() => firstRender)
      .mockResolvedValueOnce({
        diagnostics: [],
        svgs: [{ sourceIdentity: 'model.ai', diagram: 'query', svg: '<svg>new</svg>' }]
      });

    const older = test.controller.execute('isolate', 'shop/api');
    const newer = test.controller.execute('isolate', 'shop/api');
    await newer;
    resolveFirst({
      diagnostics: [],
      svgs: [{ sourceIdentity: 'model.ai', diagram: 'query', svg: '<svg>old</svg>' }]
    });
    await older;

    expect(test.ports.patchTab).toHaveBeenCalledTimes(1);
    expect(test.ports.patchTab).toHaveBeenCalledWith('tab-1', expect.objectContaining({ svg: '<svg>new</svg>' }));
  });

  it('invalidates a pending render when the linked model is refreshed', async () => {
    const test = subject();
    let resolveRender!: (value: {
      diagnostics: never[];
      svgs: { sourceIdentity: string; diagram: 'query'; svg: string }[];
    }) => void;
    test.ports.renderInBrowser.mockImplementationOnce(() => new Promise((resolve) => { resolveRender = resolve; }));

    const pending = test.controller.execute('isolate', 'shop/api');
    test.controller.reconcileAnalysis(analysis);
    resolveRender({
      diagnostics: [],
      svgs: [{ sourceIdentity: 'model.ai', diagram: 'query', svg: '<svg>stale</svg>' }]
    });
    await pending;

    expect(test.ports.patchTab).not.toHaveBeenCalled();
    expect(test.loading()).toBe(false);
  });
});
