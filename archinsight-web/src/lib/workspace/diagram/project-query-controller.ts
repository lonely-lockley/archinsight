import { defaultQuery, queryForDiagramMode } from '@archinsight/workbench/presets';
import { analyzeQuery, resolveBuiltinView, type BuiltinDiagramView, type LinkProjectResult } from '@insight/language';
import { discoverProjectQueries, isQueryFile, projectFilePaths, resolveProjectQuery } from '@archinsight/workbench/project-queries';
import type {
  QueryScopeChoice,
  QueryScopeVariable,
  QueryScopeWidgetState
} from '@archinsight/workbench/query-scope-widgets';
import type { TreeNode, WorkspaceTab } from '@archinsight/workbench/types';

export type ResolvedProjectQuery = {
  readonly query: string;
  readonly view: BuiltinDiagramView | undefined;
  readonly source?: string;
  readonly context?: string;
  readonly waiting?: string;
};

export class ProjectQuerySyntaxError extends Error {
  constructor(readonly query: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'Invalid query', { cause });
    this.name = 'ProjectQuerySyntaxError';
  }
}

export type ProjectQueryControllerPorts = {
  projectId(): string;
  tree(): TreeNode | undefined;
  tabs(): readonly WorkspaceTab[];
  activeTab(): WorkspaceTab | undefined;
  analysis(): LinkProjectResult | undefined;
  fetchFile(projectId: string, path: string): Promise<{ readonly content: string }>;
  patchTab(id: string, patch: Partial<WorkspaceTab>): void;
  persist(): void;
  refreshWidgets(): void;
  scheduleDiagram(): void;
};

export function createProjectQueryController(ports: ProjectQueryControllerPorts) {
  const querySources = (): readonly QueryScopeChoice[] => {
    const rootTypes = new Map(ports.analysis()?.contexts
      .filter((root) => root.synthetic !== true)
      .map((root) => [root.sourceIdentity, root.type]));
    return projectFilePaths(ports.tree())
      .filter((path) => path.endsWith('.ai'))
      .sort()
      .map((path) => scopeChoice(path, rootTypes.get(path)));
  };

  const availableContexts = (): readonly QueryScopeChoice[] => {
    const contexts = ports.analysis()?.contexts.filter((context) => context.synthetic !== true) ?? [];
    const rootTypes = new Map(contexts.map((context) => [context.id, context.type]));
    return [...rootTypes.keys()]
      .sort()
      .map((id) => scopeChoice(id, rootTypes.get(id)));
  };

  const widgetState = (): QueryScopeWidgetState => {
    const tab = ports.activeTab();
    const sources = querySources();
    const contexts = availableContexts();
    const source = sources.some((candidate) => candidate.value === tab?.querySource)
      ? tab?.querySource
      : undefined;
    const inferredContext = ports.analysis()?.contexts.find((context) => context.sourceIdentity === source)?.id;
    const context = source === undefined && contexts.some((candidate) => candidate.value === tab?.queryContext)
      ? tab?.queryContext
      : inferredContext;
    return {
      enabled: tab !== undefined && isQueryFile(tab.sourceIdentity),
      tab: source,
      context,
      sources,
      contexts
    };
  };

  return {
    widgetState,

    selectScope(variable: QueryScopeVariable, value: string): void {
      const tab = ports.activeTab();
      if (tab === undefined || !isQueryFile(tab.sourceIdentity)) return;
      const choices = widgetState();
      if (!(variable === 'tab' ? choices.sources : choices.contexts).some((choice) => choice.value === value)) return;
      const context = ports.analysis()?.contexts.find((item) => item.sourceIdentity === tab.querySource)?.id;
      ports.patchTab(tab.id, variable === 'tab'
        ? { querySource: value, queryContext: undefined, dot: undefined }
        : { queryContext: value, querySource: context === value ? tab.querySource : undefined, dot: undefined });
      ports.persist();
      ports.refreshWidgets();
      ports.scheduleDiagram();
    },

    selectQuery(name: string): void {
      const tab = ports.activeTab();
      if (tab === undefined || isQueryFile(tab.sourceIdentity)) return;
      const query = discoverProjectQueries(ports.tree()).find((query) => query.name === name);
      if (query === undefined) return;
      ports.patchTab(tab.id, { queryView: name, queryPreset: true, diagramMode: query.view ?? 'default', deploymentEnvironment: undefined, dot: undefined });
      ports.persist();
      ports.scheduleDiagram();
    },

    async resolve(tab: WorkspaceTab, analysis?: LinkProjectResult): Promise<ResolvedProjectQuery> {
      const projectId = ports.projectId();
      const projectQuery = resolveProjectQuery(tab, discoverProjectQueries(ports.tree()));
      const queryTab = isQueryFile(tab.sourceIdentity);
      const path = projectQuery?.paths[0];
      const fallback = tab.queryPreset ? queryForDiagramMode(tab.diagramMode) : tab.query;
      const query = queryTab ? tab.content : path === undefined ? fallback
        : ports.tabs().find((item) => item.filePath === path)?.content ?? (await ports.fetchFile(projectId, path)).content;
      if (!queryTab && projectId === ports.projectId() && ports.tabs().find((item) => item.id === tab.id) === tab && query !== tab.query) {
        ports.patchTab(tab.id, { query });
      }
      const knownSources = new Set(querySources().map((candidate) => candidate.value));
      const source = queryTab
        ? (knownSources.has(tab.querySource ?? '') ? tab.querySource : undefined)
        : tab.sourceIdentity;
      const knownContexts = new Set(availableContexts().map((candidate) => candidate.value));
      const storedContext = analysis === undefined || knownContexts.has(tab.queryContext ?? '')
        ? tab.queryContext
        : undefined;
      const context = source === undefined ? storedContext
        : analysis?.contexts.find((item) => item.sourceIdentity === source)?.id;
      let variables: readonly string[];
      try {
        variables = analyzeQuery(!queryTab && path === undefined && query.trim() === '' ? defaultQuery : query).referencedVariables;
      } catch (cause) {
        throw new ProjectQuerySyntaxError(query, cause);
      }
      const view = projectQuery?.view ?? (queryTab || tab.queryView !== undefined ? undefined : resolveBuiltinView(tab.diagramMode, true)!.id);
      const waiting = (variables.includes('tab') && source === undefined)
        || (variables.includes('context') && context === undefined)
        ? 'Select query scope'
        : undefined;
      return { query, view, source, context, waiting };
    }
  };
}

function scopeChoice(value: string, typeName: string | undefined): QueryScopeChoice {
  return { value, label: value, ...(typeName === undefined ? {} : { typeName }) };
}
