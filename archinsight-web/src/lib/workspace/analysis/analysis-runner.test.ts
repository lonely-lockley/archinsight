import { describe, expect, it, vi } from 'vitest';
import { ProjectQuerySyntaxError } from '../diagram/project-query-controller';
import { InsightLanguageService, coreLanguageSnapshot } from '@insight/language';
import type { LinkResponse } from '$lib/api';
import type { WorkspaceTab } from '@archinsight/workbench/types';
import {
  builtinView,
  createAnalysisRunner,
  hydrateLinkedModel,
  overlaysForLink,
  renderSourceIdentities,
  type AnalysisRunnerPorts
} from './analysis-runner';

const tab = (id: string, overrides: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id, filePath: id, sourceIdentity: id, title: id, content: `${id} content`, svg: '<svg/>',
  diagnostics: [], local: false, diagramMode: 'default', query: '', queryPreset: true,
  queryVisible: false, queryPanelHeight: 118, diagramScale: 1, diagramFit: false,
  viewMode: 'split', editorSplitRatio: 50, ...overrides
});

const linkResponse = (overrides: Partial<LinkResponse> = {}): LinkResponse => ({
  revision: '1',
  analysis: { mode: 'full', relinkedSources: 1 },
  symbols: { schemaVersion: 'test', types: [], constructors: [], operators: [], enums: [] },
  linkedModel: {
    graph: { nodes: [], relations: [] },
    contexts: []
  } as unknown as LinkResponse['linkedModel'],
  diagnostics: [],
  renders: [{ sourceIdentity: 'main.ai', diagram: 'query', dot: 'digraph {}' }],
  structure: { schemaVersion: 'project-structure.v1', contexts: [] },
  ...overrides
});

function fixture() {
  const main = tab('main.ai', { filePath: undefined, content: 'changed' });
  let time = 100;
  const ports: AnalysisRunnerPorts = {
    state: () => ({
      projectId: 'project', surface: 'editor', tabs: [main], activeTab: main,
      overlays: { 'saved.ai': 'saved' }, query: 'query', diagramMode: 'default',
      deploymentEnvironment: undefined
    }),
    linkProject: vi.fn(async () => linkResponse()),
    renderInBrowser: vi.fn(async () => ({
      diagnostics: [], svgs: [{ sourceIdentity: 'main.ai', diagram: 'query', svg: '<svg/>' }]
    })),
    renderOnServer: vi.fn(async () => ({ diagnostics: [], svgs: [] })),
    checkSyntax: vi.fn(async () => []),
    isCurrent: vi.fn(() => true),
    updateLocalDiagnostics: vi.fn(),
    updateLinkerDiagnostics: vi.fn(),
    setLoading: vi.fn(),
    acceptProjectSymbols: vi.fn(),
    acceptLinkedAnalysis: vi.fn(),
    reconcileDeploymentEnvironment: vi.fn(() => false),
    refreshEditorSymbols: vi.fn(),
    acceptProjectStructure: vi.fn(),
    clearDots: vi.fn(),
    acceptDiagram: vi.fn(),
    acceptQueryResult: vi.fn(),
    now: vi.fn(() => time += 5),
    queryFinished: vi.fn(),
    cycleSummary: vi.fn(),
    queryError: vi.fn(),
    error: vi.fn(),
    redirectIfAuthRequired: vi.fn(() => false),
    scheduleDiagramUpdate: vi.fn()
  };
  return { ports, runner: createAnalysisRunner(ports) };
}

describe('analysis runner', () => {
  it('builds overlays only from editable project sources', () => {
    expect(overlaysForLink([
      tab('unsaved', { filePath: undefined, sourceIdentity: 'virtual.ai', content: 'virtual' }),
      tab('core', { filePath: undefined, sourceIdentity: 'core.ai', content: 'core', projectSource: false })
    ], { 'saved.ai': 'saved' })).toEqual({ 'saved.ai': 'saved', 'virtual.ai': 'virtual' });
  });

  it('renders only the active project tab, or all project tabs for a support tab', () => {
    const main = tab('main.ai');
    const other = tab('other.ai');
    const support = tab('core.ai', { projectSource: false });
    expect(renderSourceIdentities([main, other], main)).toEqual(['main.ai']);
    expect(renderSourceIdentities([main, other, support], support)).toEqual(['main.ai', 'other.ai']);
  });

  it('maps the default mode to the language no-filter view', () => {
    expect(builtinView('default')).toBe('no-filter');
    expect(builtinView('c2')).toBe('c2');
  });

  it('hydrates transport graph data into the indexed graph used by the language service', () => {
    const result = hydrateLinkedModel(linkResponse().linkedModel);
    expect(result.graph).toBeDefined();
    expect(result.contexts).toEqual([]);
  });

  it('stops after syntax checking when the request is stale', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.isCurrent).mockReturnValueOnce(false);
    await subject.runner.runLink(4);

    expect(subject.ports.checkSyntax).toHaveBeenCalled();
    expect(subject.ports.linkProject).not.toHaveBeenCalled();
  });

  it('links, falls back to server rendering, and publishes the accepted diagram', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.renderInBrowser).mockRejectedValueOnce(new Error('worker unavailable'));
    vi.mocked(subject.ports.renderOnServer).mockResolvedValueOnce({
      diagnostics: [], svgs: [{ sourceIdentity: 'main.ai', diagram: 'query', svg: '<svg>server</svg>' }]
    });
    await subject.runner.runLink(1);

    expect(subject.ports.linkProject).toHaveBeenCalledWith(
      'project', ['main.ai'], { 'saved.ai': 'saved', 'main.ai': 'changed' },
      'query', 'no-filter', undefined, 'editor', undefined
    );
    expect(subject.ports.acceptProjectStructure).toHaveBeenCalled();
    expect(subject.ports.acceptDiagram).toHaveBeenCalledWith('main.ai', '<svg>server</svg>', 'digraph {}');
    expect(subject.ports.queryFinished).toHaveBeenCalledWith('main.ai', 5, undefined, []);
  });

  it('forwards a forced full-analysis request to the web API', async () => {
    const subject = fixture();

    await subject.runner.runLink(1, { forceFullAnalysis: true });

    expect(subject.ports.linkProject).toHaveBeenCalledWith(
      'project', ['main.ai'], { 'saved.ai': 'saved', 'main.ai': 'changed' },
      'query', 'no-filter', undefined, 'editor', { forceFullAnalysis: true }
    );
  });

  it('separates query failures from server failures', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.linkProject).mockRejectedValueOnce(new Error('Unexpected query character at offset 2'));
    await subject.runner.runLink(1);
    expect(subject.ports.queryError).toHaveBeenCalledWith('Unexpected query character at offset 2', 'query');
    expect(subject.ports.error).not.toHaveBeenCalled();
  });

  it('clears diagrams and reports linker diagnostics without rendering invalid models', async () => {
    const subject = fixture();
    vi.mocked(subject.ports.linkProject).mockResolvedValueOnce(linkResponse({
      diagnostics: [{ source: 'main.ai', level: 'ERROR', code: 'E1', message: 'broken' }]
    }));
    await subject.runner.runLink(1);
    expect(subject.ports.clearDots).toHaveBeenCalledWith(['main.ai']);
    expect(subject.ports.renderInBrowser).not.toHaveBeenCalled();
  });
});


describe('file-backed query execution', () => {
  const service = new InsightLanguageService({ snapshot: coreLanguageSnapshot });
  const model = service.link({ sources: [
    { sourceName: 'one.ai', source: 'context one\n\nsystem first\n    name = First\n' },
    { sourceName: 'two.ai', source: 'context two\n\nsystem second\n    name = Second\n' }
  ] });

  it('excludes aiq overlays from model linking but can target a query preview', () => {
    const query = tab('q.aiq', { content: 'invalid query' });
    expect(overlaysForLink([query], { 'q.aiq': 'draft', 'one.ai': 'model' })).toEqual({ 'one.ai': 'model' });
    expect(renderSourceIdentities([query, tab('one.ai')], query)).toEqual(['q.aiq']);
    expect(renderSourceIdentities([query, tab('one.ai')], undefined)).toEqual(['one.ai']);
  });

  it('renders each consumer using its own query and source, including a separate aiq preview', async () => {
    const subject = fixture();
    const active = tab('q.aiq');
    subject.ports.state = () => ({ projectId: 'project', surface: 'editor', tabs: [active], activeTab: active, overlays: {}, query: 'wrong', diagramMode: 'c2', deploymentEnvironment: undefined });
    subject.ports.resolveQuery = vi.fn(async () => ({ query: 'MATCH (n:Element) WHERE n.sourceIdentity = $tab RETURN n', view: undefined, source: 'two.ai', context: 'two' }));
    vi.mocked(subject.ports.renderInBrowser).mockImplementation(async (renders) => ({ diagnostics: [], svgs: renders.map((render) => ({ ...render, svg: '<svg/>' })) }));
    await subject.runner.runCachedDiagram(1, 'project', model);
    const renders = vi.mocked(subject.ports.renderInBrowser).mock.calls[0][0];
    expect(renders[0].sourceIdentity).toBe('q.aiq');
    expect(renders[0].dot).toContain('Second');
    expect(renders[0].dot).not.toContain('First');
    expect(subject.ports.acceptDiagram).toHaveBeenCalledWith('q.aiq', '<svg/>', renders[0].dot);
    expect(subject.ports.linkProject).not.toHaveBeenCalled();
  });

  it('publishes a table result without invoking Graphviz', async () => {
    const subject = fixture();
    const active = tab('report.aiq', { queryParameters: { element: 'two/second' } });
    subject.ports.state = () => ({ projectId: 'project', surface: 'editor', tabs: [active], activeTab: active, overlays: {}, query: 'wrong', diagramMode: 'c2', deploymentEnvironment: undefined });
    subject.ports.resolveQuery = vi.fn(async () => ({
      query: 'MATCH (n:Element) WHERE elementId(n) = $element RETURN TABLE elementId(n) AS element',
      view: undefined,
      resultKind: 'table' as const
    }));
    await subject.runner.runCachedDiagram(1, 'project', model);
    expect(subject.ports.renderInBrowser).not.toHaveBeenCalled();
    expect(subject.ports.renderOnServer).not.toHaveBeenCalled();
    expect(subject.ports.acceptQueryResult).toHaveBeenCalledWith('report.aiq', expect.objectContaining({
      kind: 'table', rows: [['two/second']]
    }));
    expect(subject.ports.queryFinished).toHaveBeenCalledWith(
      'report.aiq', 5, 1, model.diagnostics
    );
  });

  it('ignores a delayed query after the active tab changes', async () => {
    const subject = fixture();

    await subject.runner.runCachedDiagram(1, 'project', model, true, 'previous.ai');

    expect(subject.ports.setLoading).not.toHaveBeenCalled();
    expect(subject.ports.acceptQueryResult).not.toHaveBeenCalled();
    expect(subject.ports.renderInBrowser).not.toHaveBeenCalled();
    expect(subject.ports.queryFinished).not.toHaveBeenCalled();
  });

  it('passes preview scope and a raw-query view through the backend link request', async () => {
    const subject = fixture();
    subject.ports.resolveQuery = vi.fn(async () => ({ query: 'custom', view: undefined, source: 'two.ai', context: 'two' }));
    await subject.runner.runLink(1);
    expect(subject.ports.linkProject).toHaveBeenCalledWith('project', ['main.ai'], { 'saved.ai': 'saved', 'main.ai': 'changed' }, 'custom', undefined, undefined, 'editor', { querySource: 'two.ai', queryContext: 'two' });
  });

  it('loads the model before prompting for a missing preview scope', async () => {
    const subject = fixture();
    subject.ports.resolveQuery = vi.fn(async () => ({ query: 'custom', view: undefined, waiting: 'Select query scope' }));
    vi.mocked(subject.ports.linkProject).mockResolvedValue(linkResponse({ renders: [] }));
    await subject.runner.runLink(1);
    expect(vi.mocked(subject.ports.linkProject).mock.calls[0][1]).toEqual([]);
    expect(subject.ports.acceptLinkedAnalysis).toHaveBeenCalled();
    expect(subject.ports.acceptDiagram).toHaveBeenCalledWith('main.ai', expect.stringContaining('Select query scope'), undefined);
    expect(subject.ports.renderInBrowser).not.toHaveBeenCalled();
  });

  it('keeps model analysis available when a query is incomplete and rejects late resolutions', async () => {
    const subject = fixture();
    subject.ports.resolveQuery = vi.fn(async () => { throw new ProjectQuerySyntaxError('query', new Error('Unsupported MATCH clause')); });
    vi.mocked(subject.ports.linkProject).mockResolvedValue(linkResponse({ renders: [] }));
    await subject.runner.runLink(1);
    expect(subject.ports.acceptLinkedAnalysis).toHaveBeenCalled();
    expect(subject.ports.queryError).toHaveBeenCalledWith('Unsupported MATCH clause', 'query');
    expect(subject.ports.renderInBrowser).not.toHaveBeenCalled();
    subject.ports.resolveQuery = vi.fn(async () => ({ query: 'MATCH (n) RETURN n', view: undefined }));
    vi.mocked(subject.ports.isCurrent).mockReturnValue(false);
    await subject.runner.runCachedDiagram(2, 'project', model);
    expect(subject.ports.renderInBrowser).not.toHaveBeenCalled();
  });
});
