import {
  IndexedGraph,
  InsightLanguageService,
  resolveBuiltinView,
  coreLanguageSnapshot,
  type BuiltinDiagramView,
  type LanguageSnapshot,
  type LinkProjectResult
} from '@insight/language';
import type {
  Diagnostic,
  DotRender,
  LinkResponse,
  ProjectStructure,
  SvgRenderResponse
} from '$lib/api';
import type { WorkspaceSurface } from '$lib/actions/action-model';
import type { DiagramMode, WorkspaceTab } from '$lib/workspace-types';
import { hasErrorDiagnostics } from '$lib/workspace-completion-snapshot';
import { isProjectSourceTab } from '../editor/tab-persistence';
import { errorMessage, isQueryErrorMessage } from '../messages/message-controller';

export type AnalysisRunnerState = {
  readonly projectId: string;
  readonly surface: WorkspaceSurface;
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTab: WorkspaceTab | undefined;
  readonly overlays: Readonly<Record<string, string>>;
  readonly query: string;
  readonly diagramMode: DiagramMode;
  readonly deploymentEnvironment: string | undefined;
};

export type AnalysisRunnerPorts = {
  state(): AnalysisRunnerState;
  linkProject(
    projectId: string,
    openSourceIdentities: string[],
    overlays: Record<string, string>,
    query: string,
    view: BuiltinDiagramView,
    environment: string | undefined,
    surface: WorkspaceSurface
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
  acceptDiagram(sourceIdentity: string, svg: string, dot: string | undefined): void;
  cycleSummary(task: string, diagnostics: Diagnostic[]): void;
  queryError(message: string, query: string): void;
  error(message: string): void;
  redirectIfAuthRequired(error: unknown): boolean;
  scheduleDiagramUpdate(): void;
};

export type AnalysisRunner = {
  runLink(sequence: number): Promise<void>;
  runCachedDiagram(sequence: number, projectId: string, analysis: LinkProjectResult): Promise<void>;
};

export function createAnalysisRunner(ports: AnalysisRunnerPorts): AnalysisRunner {
  const languageService = new InsightLanguageService({ snapshot: coreLanguageSnapshot });

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
    sourceIdentities: readonly string[]
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
      ports.acceptDiagram(svg.sourceIdentity, svg.svg, dotBySource.get(svg.sourceIdentity));
    }
    return true;
  };

  return {
    async runCachedDiagram(sequence, projectId, analysis) {
      const state = ports.state();
      const sourceIdentities = renderSourceIdentities(state.tabs, state.activeTab);
      const renders: DotRender[] = [];
      try {
        for (const sourceIdentity of sourceIdentities) {
          const context = analysis.contexts.find((candidate) => candidate.sourceIdentity === sourceIdentity);
          renders.push({
            sourceIdentity,
            diagram: 'query',
            dot: languageService.render({
              result: analysis,
              scope: {
                context: context?.id,
                tab: sourceIdentity,
                view: builtinView(state.diagramMode),
                ...(state.deploymentEnvironment === undefined
                  ? {}
                  : { environment: state.deploymentEnvironment })
              },
              query: state.query,
              theme: 'dark'
            }).dot
          });
        }
      } catch (error) {
        if (!ports.isCurrent(sequence, projectId)) return;
        ports.clearDots(sourceIdentities);
        const message = errorMessage(error);
        if (isQueryErrorMessage(message)) {
          ports.queryError(message, state.query);
        } else {
          ports.error(`Render error: ${message}`);
        }
        return;
      }
      if (!ports.isCurrent(sequence, projectId)) return;
      if (renders.length === 0) {
        ports.clearDots(sourceIdentities);
        return;
      }
      const rendered = await renderWithFallback(projectId, state.surface, renders);
      if (!ports.isCurrent(sequence, projectId)) return;
      acceptRenderedDiagrams(renders, rendered, sourceIdentities);
    },

    async runLink(sequence) {
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

      try {
        const link = await ports.linkProject(
          state.projectId,
          sourceIdentities,
          overlays,
          state.query,
          builtinView(state.diagramMode),
          state.deploymentEnvironment,
          state.surface
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
        if (linkHasErrors || link.renders.length === 0) {
          ports.clearDots(sourceIdentities);
          return;
        }
        const rendered = await renderWithFallback(state.projectId, state.surface, link.renders);
        if (!ports.isCurrent(sequence, state.projectId)) return;
        if (!acceptRenderedDiagrams(link.renders, rendered, sourceIdentities)) return;
        if (deploymentEnvironmentChanged) ports.scheduleDiagramUpdate();
      } catch (error) {
        if (!ports.isCurrent(sequence, state.projectId)) return;
        ports.setLoading(false);
        if (ports.redirectIfAuthRequired(error)) return;
        const message = errorMessage(error);
        if (isQueryErrorMessage(message)) {
          ports.clearDots(sourceIdentities);
          ports.queryError(message, state.query);
          return;
        }
        ports.error(`Server error: ${message}`);
      }
    }
  };
}

export function overlaysForLink(
  tabs: readonly WorkspaceTab[],
  overlays: Readonly<Record<string, string>>
): Record<string, string> {
  const result = { ...overlays };
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
  return activeTab === undefined || !isProjectSourceTab(activeTab)
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
