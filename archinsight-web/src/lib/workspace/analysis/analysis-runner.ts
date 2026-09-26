import { isQueryFile } from '@archinsight/workbench/project-queries';
import { emptyDiagramSvg } from '../diagram/diagram-controller';
import { ProjectQuerySyntaxError, type ResolvedProjectQuery } from '../diagram/project-query-controller';
import {
  IndexedGraph,
  executeQuery,
  renderGraphviz,
  resolveBuiltinView,
  type BuiltinDiagramView,
  type LanguageDiagnostic,
  type LanguageSnapshot,
  type LinkProjectResult,
  type QueryTableResult,
  type RenderTheme
} from '@insight/language';
import type {
  Diagnostic,
  DotRender,
  LinkResponse,
  ProjectStructure,
  SvgRenderResponse
} from '$lib/api';
import type { WorkspaceSurface } from '$lib/actions/action-model';
import type { DiagramMode, WorkspaceTab } from '@archinsight/workbench/types';
import { hasErrorDiagnostics } from '$lib/workspace-completion-snapshot';
import { isProjectSourceTab } from '../editor/tab-persistence';
import { errorMessage, isQueryErrorMessage } from '../messages/message-controller';
import type { LinkRunOptions } from './analysis-controller';

export type AnalysisRunnerState = {
  readonly projectId: string;
  readonly surface: WorkspaceSurface;
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTab: WorkspaceTab | undefined;
  readonly overlays: Readonly<Record<string, string>>;
  readonly query: string;
  readonly diagramMode: DiagramMode;
  readonly deploymentEnvironment: string | undefined;
  readonly theme: RenderTheme;
};

export type AnalysisRunnerPorts = {
  state(): AnalysisRunnerState;
  resolveQuery?(tab: WorkspaceTab, analysis?: LinkProjectResult): Promise<ResolvedProjectQuery>;
  linkProject(
    projectId: string,
    openSourceIdentities: string[],
    overlays: Record<string, string>,
    query: string,
    view: BuiltinDiagramView | undefined,
    environment: string | undefined,
    surface: WorkspaceSurface,
    options?: LinkRunOptions
  ): Promise<LinkResponse>;
  renderInBrowser(renders: DotRender[]): Promise<SvgRenderResponse>;
  renderOnServer(projectId: string, renders: DotRender[], surface: WorkspaceSurface): Promise<SvgRenderResponse>;
  checkSyntax(sources: Array<{ sourceIdentity: string; content: string }>): Promise<Diagnostic[]>;
  isCurrent(sequence: number, projectId?: string): boolean;
  updateLocalDiagnostics(sources: string[], diagnostics: Diagnostic[]): void;
  updateLinkerDiagnostics(diagnostics: Diagnostic[], preflightSources?: string[]): void;
  setLoading(loading: boolean): void;
  acceptProjectSymbols(symbols: LanguageSnapshot): void;
  acceptLinkedAnalysis(analysis: LinkProjectResult | undefined): void;
  reconcileDeploymentEnvironment(analysis: LinkProjectResult): boolean;
  refreshEditorSymbols(): void;
  acceptProjectStructure(structure: ProjectStructure): void;
  clearDots(sourceIdentities: readonly string[]): void;
  acceptDiagram(sourceIdentity: string, svg: string, dot: string | undefined, theme: RenderTheme | undefined): void;
  acceptQueryResult(sourceIdentity: string, result: QueryTableResult | undefined): void;
  now(): number;
  queryFinished(sourceIdentity: string, durationMs: number, rowCount: number | undefined, diagnostics: readonly LanguageDiagnostic[]): void;
  cycleSummary(task: string, diagnostics: Diagnostic[]): void;
  queryError(message: string, query: string): void;
  error(message: string): void;
  redirectIfAuthRequired(error: unknown): boolean;
  scheduleDiagramUpdate(): void;
};

export type AnalysisRunner = {
  runLink(sequence: number, options?: LinkRunOptions): Promise<void>;
  runCachedDiagram(
    sequence: number,
    projectId: string,
    analysis: LinkProjectResult,
    reportDiagnostics?: boolean,
    expectedTabId?: string
  ): Promise<void>;
};

export function createAnalysisRunner(ports: AnalysisRunnerPorts): AnalysisRunner {
  const renderWithFallback = async (
    projectId: string,
    surface: WorkspaceSurface,
    renders: DotRender[]
  ): Promise<SvgRenderResponse> => {
    try {
      return await ports.renderInBrowser(renders);
    } catch {
      return ports.renderOnServer(projectId, renders, surface);
    }
  };

  const acceptRenderedDiagrams = (
    renders: readonly DotRender[],
    rendered: SvgRenderResponse,
    sourceIdentities: readonly string[],
    theme: RenderTheme
  ): boolean => {
    if (rendered.diagnostics.length > 0) {
      ports.cycleSummary('Renderer finished', rendered.diagnostics);
      if (rendered.diagnostics.some((diagnostic) => diagnostic.level === 'ERROR')) {
        ports.clearDots(sourceIdentities);
        return false;
      }
    }
    if (rendered.svgs.length === 0) {
      ports.clearDots(sourceIdentities);
      ports.error('Renderer returned no SVG output');
      return false;
    }
    const dotBySource = dotRendersBySource(renders);
    for (const svg of rendered.svgs) {
      ports.acceptDiagram(svg.sourceIdentity, svg.svg, dotBySource.get(svg.sourceIdentity), theme);
    }
    return true;
  };

  const runner: AnalysisRunner = {
    async runCachedDiagram(sequence, projectId, analysis, reportDiagnostics = true, expectedTabId) {
      const state = ports.state();
      if (expectedTabId !== undefined && state.activeTab?.id !== expectedTabId) return;
      ports.setLoading(true);
      const startedAt = ports.now();
      const queryDocument = state.activeTab !== undefined && isQueryFile(state.activeTab.sourceIdentity);
      const sourceIdentities = queryDocument ? [state.activeTab!.sourceIdentity] : renderSourceIdentities(state.tabs, state.activeTab);
      const renders: DotRender[] = [];
      try {
        for (const sourceIdentity of sourceIdentities) {
          const tab = state.tabs.find((item) => item.sourceIdentity === sourceIdentity)!;
          const resolved = await ports.resolveQuery?.(tab, analysis);
          if (!ports.isCurrent(sequence, projectId)) return;
          if (resolved?.waiting !== undefined) {
            ports.acceptQueryResult(sourceIdentity, undefined);
            ports.acceptDiagram(sourceIdentity, emptyDiagramSvg(resolved.waiting), undefined, undefined);
            continue;
          }
          const context = analysis.contexts.find((candidate) => candidate.sourceIdentity === (resolved?.source ?? sourceIdentity));
          const scope = {
            context: resolved?.context ?? context?.id,
            tab: resolved === undefined ? sourceIdentity : resolved.source,
            view: resolved === undefined ? builtinView(state.diagramMode) : resolved.view,
            ...((resolved === undefined ? state.deploymentEnvironment : tab.deploymentEnvironment) === undefined
              ? {}
              : { environment: resolved === undefined ? state.deploymentEnvironment : tab.deploymentEnvironment })
          };
          const result = executeQuery(analysis, scope, resolved?.query ?? state.query, tab.queryParameters ?? {});
          if (result.kind === 'table') {
            ports.clearDots([sourceIdentity]);
            ports.acceptQueryResult(sourceIdentity, result);
            ports.queryFinished(
              sourceIdentity,
              ports.now() - startedAt,
              result.metadata.rowCount,
              reportDiagnostics ? analysis.diagnostics : []
            );
            continue;
          }
          ports.acceptQueryResult(sourceIdentity, undefined);
          renders.push({
            sourceIdentity,
            diagram: 'query',
            dot: renderGraphviz(analysis, result.graph, state.theme)
          });
        }
      } catch (error) {
        if (!ports.isCurrent(sequence, projectId)) return;
        ports.clearDots(sourceIdentities);
        sourceIdentities.forEach((sourceIdentity) => ports.acceptQueryResult(sourceIdentity, undefined));
        const message = errorMessage(error);
        if (error instanceof ProjectQuerySyntaxError) {
          ports.queryError(message, error.query);
        } else if (isQueryErrorMessage(message)) {
          ports.queryError(message, state.activeTab !== undefined && isQueryFile(state.activeTab.sourceIdentity) ? state.activeTab.content : state.query);
        } else {
          ports.error(`Render error: ${message}`);
        }
        return;
      } finally {
        if (ports.isCurrent(sequence, projectId)) ports.setLoading(false);
      }
      if (!ports.isCurrent(sequence, projectId)) return;
      if (renders.length === 0) {
        ports.clearDots(sourceIdentities);
        return;
      }
      const rendered = await renderWithFallback(projectId, state.surface, renders);
      if (!ports.isCurrent(sequence, projectId)) return;
      if (acceptRenderedDiagrams(renders, rendered, sourceIdentities, state.theme)) {
        const durationMs = ports.now() - startedAt;
        renders.forEach((render) => ports.queryFinished(
          render.sourceIdentity,
          durationMs,
          undefined,
          reportDiagnostics ? analysis.diagnostics : []
        ));
      }
    },

    async runLink(sequence, options) {
      ports.setLoading(true);
      const startedAt = ports.now();
      const state = ports.state();
      const overlays = overlaysForLink(state.tabs, state.overlays);
      const overlaySources = Object.entries(overlays).map(([sourceIdentity, content]) => ({
        sourceIdentity,
        content
      }));
      const syntaxDiagnostics = await ports.checkSyntax(overlaySources);
      if (!ports.isCurrent(sequence)) return;
      const parsedSources = overlaySources.map((source) => source.sourceIdentity);
      ports.updateLocalDiagnostics(parsedSources, syntaxDiagnostics);
      const sourceIdentities = renderSourceIdentities(state.tabs, state.activeTab);

      let resolved: ResolvedProjectQuery | undefined;
      let deferredQuery = false;
      try {
        if (ports.resolveQuery !== undefined && state.activeTab !== undefined && state.activeTab.projectSource !== false) {
          try {
            resolved = await ports.resolveQuery(state.activeTab);
            deferredQuery = resolved.waiting !== undefined
              || resolved.resultKind === 'table'
              || isQueryFile(state.activeTab.sourceIdentity);
          } catch { deferredQuery = true; }
        }
        if (!ports.isCurrent(sequence, state.projectId)) return;
        const link = await ports.linkProject(
          state.projectId,
          deferredQuery ? [] : sourceIdentities,
          overlays,
          resolved?.query ?? state.query,
          resolved === undefined ? builtinView(state.diagramMode) : resolved.view,
          state.deploymentEnvironment,
          state.surface,
          resolved === undefined
            ? { ...options, theme: state.theme }
            : { ...options, querySource: resolved.source, queryContext: resolved.context, theme: state.theme }
        );
        if (!ports.isCurrent(sequence, state.projectId)) return;
        ports.setLoading(false);
        ports.acceptProjectSymbols(link.symbols);
        const linkHasErrors = hasErrorDiagnostics(link.diagnostics);
        const linkedAnalysis = linkHasErrors ? undefined : hydrateLinkedModel(link.linkedModel);
        ports.acceptLinkedAnalysis(linkedAnalysis);
        const deploymentEnvironmentChanged = linkedAnalysis === undefined
          ? false
          : ports.reconcileDeploymentEnvironment(linkedAnalysis);
        ports.refreshEditorSymbols();
        ports.updateLinkerDiagnostics(link.diagnostics, parsedSources);
        if (!linkHasErrors) ports.acceptProjectStructure(link.structure);
        ports.cycleSummary('Linker finished', link.diagnostics);
        if (!linkHasErrors && deferredQuery && linkedAnalysis !== undefined) {
          await runner.runCachedDiagram(sequence, state.projectId, linkedAnalysis, false, state.activeTab?.id);
          return;
        }
        if (linkHasErrors || link.renders.length === 0) {
          ports.clearDots(sourceIdentities);
          sourceIdentities.forEach((sourceIdentity) => ports.acceptQueryResult(sourceIdentity, undefined));
          return;
        }
        const rendered = await renderWithFallback(state.projectId, state.surface, link.renders);
        if (!ports.isCurrent(sequence, state.projectId)) return;
        if (!acceptRenderedDiagrams(link.renders, rendered, sourceIdentities, state.theme)) return;
        const durationMs = ports.now() - startedAt;
        link.renders.forEach((render) => ports.queryFinished(render.sourceIdentity, durationMs, undefined, []));
        if (deploymentEnvironmentChanged) ports.scheduleDiagramUpdate();
        if (ports.state().theme !== state.theme) ports.scheduleDiagramUpdate();
      } catch (error) {
        if (!ports.isCurrent(sequence, state.projectId)) return;
        ports.setLoading(false);
        if (ports.redirectIfAuthRequired(error)) return;
        const message = errorMessage(error);
        if (isQueryErrorMessage(message)) {
          ports.clearDots(sourceIdentities);
          ports.queryError(message, state.activeTab !== undefined && isQueryFile(state.activeTab.sourceIdentity) ? state.activeTab.content : state.query);
          return;
        }
        ports.error(`Server error: ${message}`);
      }
    }
  };
  return runner;
}

export function overlaysForLink(
  tabs: readonly WorkspaceTab[],
  overlays: Readonly<Record<string, string>>
): Record<string, string> {
  const result = Object.fromEntries(Object.entries(overlays).filter(([path]) => !isQueryFile(path)));
  for (const tab of tabs) {
    if (tab.filePath === undefined && isProjectSourceTab(tab)) {
      result[tab.sourceIdentity] = tab.content;
    }
  }
  return result;
}

export function renderSourceIdentities(
  tabs: readonly WorkspaceTab[],
  activeTab: WorkspaceTab | undefined
): string[] {
  const linkableTabs = tabs.filter(isProjectSourceTab);
  return activeTab === undefined || activeTab.projectSource === false
    ? linkableTabs.map((tab) => tab.sourceIdentity)
    : [activeTab.sourceIdentity];
}

export function hydrateLinkedModel(model: LinkResponse['linkedModel']): LinkProjectResult {
  const graph = new IndexedGraph();
  for (const node of model.graph.nodes) graph.addNode(node);
  for (const relation of model.graph.relations) graph.addRelation(relation);
  return {
    ...model,
    graph
  };
}

export function builtinView(mode: DiagramMode): BuiltinDiagramView {
  return resolveBuiltinView(mode, true)!.id;
}

function dotRendersBySource(renders: readonly DotRender[]): Map<string, string> {
  return new Map(renders.map((render) => [render.sourceIdentity, render.dot]));
}
