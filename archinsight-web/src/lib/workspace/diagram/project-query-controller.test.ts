import { describe, expect, it, vi } from 'vitest';
import { queryForDiagramMode } from '@archinsight/workbench/presets';
import { discoverProjectQueries, projectFilePaths, resolveProjectQuery } from '@archinsight/workbench/project-queries';
import { createProjectQueryController } from './project-query-controller';
import type { WorkspaceTab, TreeNode } from '@archinsight/workbench/types';
import { buildLanguageSnapshotResultFromSources, coreLanguageSnapshot, linkProject, type LinkProjectResult } from '@insight/language';

const tab = (path: string, extra: Partial<WorkspaceTab> = {}): WorkspaceTab => ({
  id: path, filePath: path, sourceIdentity: path, title: path, content: 'MATCH (n:Element) RETURN n',
  svg: '', dot: 'old', diagnostics: [], local: false, diagramMode: 'c2', query: 'builtin', queryPreset: true,
  queryVisible: false, queryPanelHeight: 118, diagramScale: 1, diagramFit: false, viewMode: 'split', editorSplitRatio: 50, ...extra
});
const tree = (...paths: string[]): TreeNode => ({
  name: 'project', path: '', type: 'directory', children: paths.map((path) => ({ name: path.split('/').at(-1)!, path, type: 'file', children: [] }))
});
const analysis = { contexts: [
  { id: 'shop', sourceIdentity: 'shop.ai' }, { id: 'other', sourceIdentity: 'other.ai' },
  { id: 'shop', sourceIdentity: 'extension.ai' }, { id: 'hidden', sourceIdentity: 'hidden.ai', synthetic: true }
] } as unknown as LinkProjectResult;
function fixture(active = tab('q.aiq'), files = tree('shop.ai', 'other.ai', 'q.aiq')) {
  let tabs = [active];
  let projectId = 'one';
  const ports = {
    projectId: () => projectId, tree: () => files, tabs: () => tabs, activeTab: () => tabs[0], analysis: vi.fn((): LinkProjectResult | undefined => analysis),
    fetchFile: vi.fn(async () => ({ content: 'MATCH (n:Element) RETURN n' })),
    patchTab: vi.fn((id: string, patch: Partial<WorkspaceTab>) => { tabs = tabs.map((item) => item.id === id ? { ...item, ...patch } : item); }),
    persist: vi.fn(), refreshWidgets: vi.fn(), scheduleDiagram: vi.fn()
  };
  return { ports, controller: createProjectQueryController(ports), setTabs: (next: WorkspaceTab[]) => { tabs = next; }, switchProject: () => { projectId = 'two'; tabs = []; } };
}

describe('project query discovery', () => {
  it('uses only the basename and exact extension, at every depth', () => {
    const files = tree('x/c2.aiq', 'nested/deep/impact.aiq', 'c2.ai', 'upper.AIQ', 'd1.aiq', 'deployment-system.aiq');
    expect(discoverProjectQueries(files)).toEqual([
      { name: 'c2', paths: ['x/c2.aiq'], view: 'c2' },
      { name: 'd1', paths: ['d1.aiq'], view: undefined },
      { name: 'deployment-system', paths: ['deployment-system.aiq'], view: 'deployment-system' },
      { name: 'impact', paths: ['nested/deep/impact.aiq'], view: undefined }
    ]);
    expect(projectFilePaths(undefined)).toEqual([]);
    expect(discoverProjectQueries({ ...tree(), children: [files] })).toEqual(discoverProjectQueries(files));
  });
  it('does not discover queries inside hidden or generated directories', () => {
    const directory = (path: string, children: TreeNode[]): TreeNode => ({
      name: path.split('/').at(-1) ?? path, path, type: 'directory', children
    });
    const file = (path: string): TreeNode => ({
      name: path.split('/').at(-1)!, path, type: 'file', children: []
    });
    const files = directory('', [
      directory('.claude', [file('.claude/skills/archinsight/examples/builtin-views/c2.aiq')]),
      directory('.codex', [file('.codex/skills/archinsight/examples/builtin-views/c2.aiq')]),
      directory('.cache', [file('.cache/cached.aiq')]),
      directory('node_modules', [file('node_modules/package/example.aiq')]),
      directory('build', [file('build/generated.aiq')]),
      directory('dist', [file('dist/generated.aiq')]),
      directory('views', [file('views/c2.aiq'), file('views/impact.aiq')]),
      file('model.ai')
    ]);

    expect(projectFilePaths(files)).toEqual(['views/c2.aiq', 'views/impact.aiq', 'model.ai']);
    expect(discoverProjectQueries(files)).toEqual([
      { name: 'c2', paths: ['views/c2.aiq'], view: 'c2' },
      { name: 'impact', paths: ['views/impact.aiq'], view: undefined }
    ]);
  });
  it('reports duplicate names instead of choosing by traversal order', () => {
    const files = tree('b/c2.aiq', 'a/c2.aiq');
    expect(() => resolveProjectQuery(tab('shop.ai'), discoverProjectQueries(files))).toThrow("Query name 'c2' is ambiguous: a/c2.aiq, b/c2.aiq");
    expect(() => resolveProjectQuery(tab('shop.ai', { queryView: 'gone' }), [])).toThrow("'gone.aiq' was not found");
    expect(resolveProjectQuery(tab('shop.ai', { queryPreset: false }), discoverProjectQueries(files))).toBeUndefined();
  });
});

describe('project query execution', () => {
  it('shows actual context and environment types for scope and source choices', () => {
    const sources = [
      { sourceName: 'definitions.ai', source: 'define type RegionCatalog of Environment\n    Text caption\n' },
      { sourceName: 'logical.ai', source: 'context commerce\n    name = Commerce\n' },
      { sourceName: 'infra.ai', source: 'environment eu\n    name = Europe\n' }
    ];
    const { snapshot } = buildLanguageSnapshotResultFromSources(sources, [coreLanguageSnapshot]);
    const linked = linkProject({ snapshot, sources });
    const subject = fixture(tab('q.aiq'), tree('logical.ai', 'infra.ai', 'definitions.ai', 'unknown.ai', 'q.aiq'));
    subject.ports.analysis.mockReturnValue(linked);
    expect(subject.controller.widgetState().contexts).toEqual([
      { value: 'commerce', label: 'commerce', typeName: 'Context' },
      { value: 'eu', label: 'eu', typeName: 'RegionCatalog' }
    ]);
    expect(subject.controller.widgetState().sources).toEqual([
      { value: 'definitions.ai', label: 'definitions.ai' },
      { value: 'infra.ai', label: 'infra.ai', typeName: 'RegionCatalog' },
      { value: 'logical.ai', label: 'logical.ai', typeName: 'Context' },
      { value: 'unknown.ai', label: 'unknown.ai' }
    ]);
    subject.controller.selectScope('context', 'eu');
    expect(subject.ports.tabs()[0].queryContext).toBe('eu');
    subject.ports.analysis.mockReturnValue(undefined);
    expect(subject.controller.widgetState().contexts).toEqual([]);
    expect(subject.controller.widgetState().sources.every((choice) => choice.typeName === undefined)).toBe(true);
  });

  it('resolves an unopened override and retains its built-in pipeline and caller scope', async () => {
    const active = tab('shop.ai');
    const subject = fixture(active, tree('shop.ai', 'nested/c2.aiq'));
    expect(await subject.controller.resolve(active, analysis)).toMatchObject({ view: 'c2', source: 'shop.ai', context: 'shop' });
    expect(subject.ports.fetchFile).toHaveBeenCalledWith('one', 'nested/c2.aiq');
    expect(subject.ports.tabs()[0].query).toBe('MATCH (n:Element) RETURN n');
  });
  it('rejects a table result used as a reserved built-in override', async () => {
    const active = tab('shop.ai');
    const subject = fixture(active, tree('shop.ai', 'c2.aiq'));
    subject.ports.fetchFile.mockResolvedValue({ content: 'MATCH (n:Element) RETURN TABLE elementId(n) AS id' });
    await expect(subject.controller.resolve(active, analysis)).rejects.toThrow("Built-in view override 'c2' must return a graph");
  });
  it('uses unsaved query content for each caller with its own scope', async () => {
    const first = tab('shop.ai');
    const second = tab('other.ai');
    const draft = tab('deep/c2.aiq', { content: 'MATCH (n) RETURN n' });
    const subject = fixture(first, tree('deep/c2.aiq'));
    subject.setTabs([first, second, draft]);
    expect(await subject.controller.resolve(first, analysis)).toMatchObject({ query: 'MATCH (n) RETURN n', source: 'shop.ai', context: 'shop', view: 'c2' });
    expect(await subject.controller.resolve(second, analysis)).toMatchObject({ query: 'MATCH (n) RETURN n', source: 'other.ai', context: 'other', view: 'c2' });
    expect(subject.ports.fetchFile).not.toHaveBeenCalled();
  });
  it('restores the built-in query after an override disappears and preserves detached local edits', async () => {
    const active = tab('shop.ai', { query: 'old override' });
    const subject = fixture(active, tree('shop.ai'));
    expect((await subject.controller.resolve(active, analysis)).query).toBe(queryForDiagramMode('c2'));
    expect(subject.ports.tabs()[0].query).toBe(queryForDiagramMode('c2'));
    const local = tab('shop.ai', { query: 'MATCH (n) RETURN n', queryPreset: false });
    expect((await subject.controller.resolve(local, analysis)).query).toBe(local.query);
  });
  it('reports incomplete query text while leaving the model graph available', async () => {
    const active = tab('q.aiq', { content: 'MATCH (' });
    const subject = fixture(active);
    await expect(subject.controller.resolve(active, analysis)).rejects.toMatchObject({ name: 'ProjectQuerySyntaxError', query: 'MATCH (' });
    expect(subject.ports.analysis()).toBe(analysis);
  });
  it('uses a standalone query without inheriting the caller C2 pipeline', async () => {
    const active = tab('shop.ai', { queryView: 'q' });
    const subject = fixture(active);
    expect(await subject.controller.resolve(active, analysis)).toMatchObject({ view: undefined, source: 'shop.ai' });
    subject.controller.selectQuery('missing');
    expect(subject.ports.scheduleDiagram).not.toHaveBeenCalled();
    subject.controller.selectQuery('q');
    expect(subject.ports.tabs()[0].queryView).toBe('q');
    expect(subject.ports.scheduleDiagram).toHaveBeenCalledOnce();
  });
  it('keeps scope chips exclusive to query documents and ignores invalid selections', () => {
    const subject = fixture(tab('shop.ai'));
    expect(subject.controller.widgetState().enabled).toBe(false);
    subject.controller.selectScope('tab', 'other.ai');
    expect(subject.ports.patchTab).not.toHaveBeenCalled();
    subject.setTabs([tab('q.aiq')]);
    subject.controller.selectScope('tab', 'missing.ai');
    expect(subject.ports.patchTab).not.toHaveBeenCalled();
    subject.controller.selectQuery('q');
    expect(subject.ports.patchTab).not.toHaveBeenCalled();
    expect(subject.controller.widgetState().sources).toEqual([{ value: 'other.ai', label: 'other.ai' }, { value: 'shop.ai', label: 'shop.ai' }]);
    expect(subject.controller.widgetState().contexts).toEqual([{ value: 'other', label: 'other' }, { value: 'shop', label: 'shop' }]);
  });
  it('presents stale internal preview scope as unselected', () => {
    const subject = fixture(tab('q.aiq', {
      querySource: '__unsaved__/untitled-1.ai',
      queryContext: '__internal__'
    }));
    expect(subject.controller.widgetState()).toMatchObject({
      enabled: true,
      tab: undefined,
      context: undefined
    });
  });
  it('infers context from the selected source and prevents conflicting selections', () => {
    const subject = fixture();
    subject.controller.selectScope('tab', 'shop.ai');
    expect(subject.controller.widgetState()).toMatchObject({ tab: 'shop.ai', context: 'shop' });
    subject.controller.selectScope('context', 'shop');
    expect(subject.ports.tabs()[0]).toMatchObject({ querySource: 'shop.ai', queryContext: 'shop' });
    subject.controller.selectScope('context', 'other');
    expect(subject.ports.tabs()[0].querySource).toBeUndefined();
    expect(subject.controller.widgetState().context).toBe('other');
    expect(subject.ports.tabs()[0].content).toBe('MATCH (n:Element) RETURN n');
  });
  it.each([
    ['MATCH (n) WHERE n.sourceIdentity = $tab RETURN n', {}, 'Select query scope'],
    ['MATCH (n) WHERE n.context = $context RETURN n', {}, 'Select query scope'],
    ['MATCH (n) WHERE n.sourceIdentity = $tab RETURN n', { querySource: '__unsaved__/untitled-1.ai' }, 'Select query scope'],
    ['MATCH (n) WHERE n.context = $context RETURN n', { queryContext: 'gone' }, 'Select query scope'],
    ['MATCH (n) WHERE n.context = $context RETURN n', { querySource: 'unscoped.ai' }, 'Select query scope']
  ])('shows missing execution scope for %s', async (content, scope, waiting) => {
    const active = tab('q.aiq', { content, ...scope });
    const subject = fixture(active, tree('shop.ai', 'other.ai', 'unscoped.ai', 'q.aiq'));
    expect((await subject.controller.resolve(active, analysis)).waiting).toBe(waiting);
  });
  it('allows context-only and unscoped queries and ignores variables in comments and strings', async () => {
    const active = tab('q.aiq', { content: "MATCH (n) WHERE n.name = '$tab' # $tab\nRETURN n", queryContext: 'shop' });
    const subject = fixture(active);
    expect(await subject.controller.resolve(active, analysis)).toEqual({
      query: active.content, source: undefined, context: 'shop', view: undefined, waiting: undefined,
      resultKind: 'graph', requiredParameters: []
    });
  });
  it('does not update a different project when file loading completes late', async () => {
    const active = tab('shop.ai');
    const subject = fixture(active, tree('c2.aiq'));
    let finish!: (value: { content: string }) => void;
    subject.ports.fetchFile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = subject.controller.resolve(active);
    subject.switchProject();
    finish({ content: 'MATCH (n) RETURN n' });
    await pending;
    expect(subject.ports.patchTab).not.toHaveBeenCalled();
  });
});
