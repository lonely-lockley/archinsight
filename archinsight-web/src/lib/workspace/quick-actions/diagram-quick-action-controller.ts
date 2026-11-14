import {
  deploymentEnvironmentsForElement,
  diagramElementMetadata,
  diagramQuickActionMetadata,
  renderGraphviz,
  resolveBuiltinView,
  selectDeploymentGraph,
  selectIsolatedElementGraph,
  selectPathGraph,
  type DeploymentEnvironment,
  type LinkProjectResult,
  type QueryScope,
  type RenderGraph,
  type RenderTheme
} from '@insight/language';
import {
  beginFindPath,
  beginIsolate,
  cancelIsolate,
  cancelFindPath,
  idleFindPathMode,
  reverseFindPathResult,
  resolveFindPathTarget,
  retryFindPathTarget,
  showResolvedFindPath,
  type DiagramQuickActionId,
  type FindPathMode,
  type IsolateMode
} from '@archinsight/workbench/diagram-quick-actions';
import type { WorkspaceSurface } from '$lib/actions/action-model';
import type { DotRender, SvgRenderResponse } from '$lib/api';
import type { SourceLocation, WorkspaceTab } from '@archinsight/workbench/types';

type ResultPatch = Partial<Pick<WorkspaceTab, 'svg' | 'dot' | 'queryResult'>>;
type DiagramSnapshot = { readonly tabId: string; readonly patch: ResultPatch };
type ResolvingFindPathMode = Extract<FindPathMode, { readonly status: 'resolving-path' }>;
type ShowingFindPathMode = Extract<FindPathMode, { readonly status: 'showing-path' }>;

export type DiagramQuickActionControllerPorts = {
  analysis(): LinkProjectResult | undefined;
  activeTab(): WorkspaceTab | undefined;
  projectId(): string;
  surface(): WorkspaceSurface;
  theme(): RenderTheme;
  findPathMode(): FindPathMode;
  setFindPathMode(mode: FindPathMode): void;
  isolateMode(): IsolateMode;
  setIsolateMode(mode: IsolateMode): void;
  pendingDeploymentElementId(): string | undefined;
  setPendingDeploymentElementId(elementId: string | undefined): void;
  setDeploymentPickerOpen(open: boolean): void;
  setLoading(loading: boolean): void;
  patchTab(tabId: string, patch: ResultPatch): void;
  renderInBrowser(renders: DotRender[]): Promise<SvgRenderResponse>;
  renderOnServer(projectId: string, renders: DotRender[], surface: WorkspaceSurface): Promise<SvgRenderResponse>;
  goToDeclaration(location: SourceLocation): Promise<void> | void;
  info(message: string): void;
  error(message: string): void;
};

export type DiagramQuickActionController = {
  execute(action: DiagramQuickActionId, elementId: string): Promise<void>;
  selectPathTarget(elementId: string): Promise<void>;
  reverseFindPath(): Promise<void>;
  cancelFindPath(): void;
  cancelIsolate(): void;
  deploymentEnvironments(): readonly DeploymentEnvironment[];
  selectDeploymentEnvironment(environment: string | undefined): Promise<boolean>;
  closeDeploymentPicker(): boolean;
  invalidateRender(): void;
  reconcileAnalysis(analysis: LinkProjectResult | undefined): void;
  reset(reason?: 'project-change'): void;
};

export function createDiagramQuickActionController(
  ports: DiagramQuickActionControllerPorts
): DiagramQuickActionController {
  let generation = 0;
  let rendering = false;
  let findPathDiagramSnapshot: DiagramSnapshot | undefined;
  let isolateDiagramSnapshot: DiagramSnapshot | undefined;

  const metadataFor = (elementId: string) => {
    const analysis = ports.analysis();
    return analysis === undefined
      ? undefined
      : diagramElementMetadata(diagramQuickActionMetadata(analysis), elementId);
  };

  const diagramSnapshot = (): DiagramSnapshot | undefined => {
    const tab = ports.activeTab();
    return tab === undefined ? undefined : {
      tabId: tab.id,
      patch: { svg: tab.svg, dot: tab.dot, queryResult: tab.queryResult }
    };
  };

  const currentQuickActionScope = (analysis: LinkProjectResult): QueryScope | undefined => {
    const tab = ports.activeTab();
    if (tab === undefined) return undefined;
    const sourceIdentity = tab.querySource ?? tab.sourceIdentity;
    const context = tab.queryContext
      ?? analysis.contexts.find((candidate) => candidate.sourceIdentity === sourceIdentity)?.id;
    const view = resolveBuiltinView(tab.diagramMode, true)?.id;
    return {
      ...(context === undefined ? {} : { context }),
      tab: sourceIdentity,
      ...(view === undefined ? {} : { view }),
      ...(tab.deploymentEnvironment === undefined ? {} : { environment: tab.deploymentEnvironment })
    };
  };

  const restoreFindPathDiagram = (): void => {
    if (findPathDiagramSnapshot === undefined) return;
    ports.patchTab(findPathDiagramSnapshot.tabId, findPathDiagramSnapshot.patch);
    findPathDiagramSnapshot = undefined;
  };

  const restoreIsolateDiagram = (): void => {
    if (isolateDiagramSnapshot === undefined) return;
    ports.patchTab(isolateDiagramSnapshot.tabId, isolateDiagramSnapshot.patch);
    isolateDiagramSnapshot = undefined;
  };

  const render = async (graph: RenderGraph, label: string): Promise<boolean> => {
    const analysis = ports.analysis();
    const tab = ports.activeTab();
    if (analysis === undefined || tab === undefined) return false;
    const currentGeneration = ++generation;
    const projectId = ports.projectId();
    rendering = true;
    ports.setLoading(true);
    try {
      const dot = renderGraphviz(analysis, graph, ports.theme());
      const renders: DotRender[] = [{ sourceIdentity: tab.sourceIdentity, diagram: 'query', dot }];
      let rendered: SvgRenderResponse;
      try {
        rendered = await ports.renderInBrowser(renders);
      } catch {
        rendered = await ports.renderOnServer(projectId, renders, ports.surface());
      }
      if (currentGeneration !== generation || ports.projectId() !== projectId) {
        return false;
      }
      const error = rendered.diagnostics.find((diagnostic) => diagnostic.level === 'ERROR');
      const svg = rendered.svgs.find((item) => item.sourceIdentity === tab.sourceIdentity)?.svg;
      if (error !== undefined || svg === undefined) {
        ports.error(error?.message ?? `Renderer returned no SVG for ${label}`);
        return false;
      }
      ports.patchTab(tab.id, { svg, dot, queryResult: undefined });
      return true;
    } catch (error) {
      if (currentGeneration === generation) {
        ports.error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    } finally {
      if (currentGeneration === generation) {
        rendering = false;
        ports.setLoading(false);
      }
    }
  };

  const resolveAndRenderPath = async (
    analysis: LinkProjectResult,
    resolving: ResolvingFindPathMode,
    failureMode: FindPathMode,
    captureSnapshot: boolean
  ): Promise<void> => {
    ports.setFindPathMode(resolving);
    let graph: RenderGraph;
    try {
      graph = selectPathGraph(
        analysis,
        resolving.sourceId,
        resolving.targetId,
        currentQuickActionScope(analysis)
      );
    } catch (error) {
      if (ports.findPathMode() === resolving) {
        ports.setFindPathMode(failureMode);
        ports.error(`Find path failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    if (graph.edges.length === 0) {
      const message = `No path found between ${resolving.sourceTitle} and ${resolving.targetTitle}.`;
      ports.info(message);
    }
    if (ports.findPathMode() !== resolving) return;
    const showing = showResolvedFindPath(resolving);
    ports.setFindPathMode(showing);
    const snapshot = captureSnapshot ? diagramSnapshot() : undefined;
    const accepted = await render(graph, 'Find path');
    if (accepted && snapshot !== undefined) findPathDiagramSnapshot = snapshot;
    if (!accepted && ports.findPathMode() === showing) {
      ports.setFindPathMode(failureMode);
    }
  };

  const controller: DiagramQuickActionController = {
    async execute(action, elementId) {
      const analysis = ports.analysis();
      const metadata = metadataFor(elementId);
      if (analysis === undefined || metadata === undefined) return;
      if (action === 'go-to-declaration') {
        if (metadata.declaration === undefined) return;
        await ports.goToDeclaration({
          source: metadata.declaration.sourceName,
          line: metadata.declaration.line,
          column: metadata.declaration.column
        });
        return;
      }
      if (action === 'find-path') {
        if (!metadata.pathEligible) return;
        if (ports.isolateMode().status !== 'idle') {
          restoreIsolateDiagram();
          ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
        }
        restoreFindPathDiagram();
        generation++;
        if (rendering) {
          rendering = false;
          ports.setLoading(false);
        }
        ports.setFindPathMode(beginFindPath(metadata));
        return;
      }
      if (action === 'isolate') {
        if (!metadata.isolateEligible) return;
        if (ports.findPathMode().status !== 'idle') {
          restoreFindPathDiagram();
          ports.setFindPathMode(cancelFindPath(ports.findPathMode()));
        }
        const previousMode = ports.isolateMode();
        const snapshot = previousMode.status === 'idle' ? diagramSnapshot() : undefined;
        const accepted = await render(
          selectIsolatedElementGraph(analysis, metadata.canonicalElementId, currentQuickActionScope(analysis)),
          'Isolate'
        );
        if (accepted) {
          if (snapshot !== undefined) isolateDiagramSnapshot = snapshot;
          ports.setIsolateMode(beginIsolate(metadata));
        }
        return;
      }
      if (ports.isolateMode().status !== 'idle') {
        restoreIsolateDiagram();
        ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
      }
      if (!metadata.hasDeployment) return;
      const environments = deploymentEnvironmentsForElement(analysis, metadata.canonicalElementId);
      if (environments.length === 0) {
        ports.info(`No deployment is available for ${metadata.title}`);
        return;
      }
      if (environments.length > 1) {
        ports.setPendingDeploymentElementId(metadata.canonicalElementId);
        ports.setDeploymentPickerOpen(true);
        return;
      }
      await render(
        selectDeploymentGraph(analysis, metadata.canonicalElementId, environments[0]!.id),
        'Show deployment'
      );
    },

    async selectPathTarget(elementId) {
      const analysis = ports.analysis();
      const metadata = metadataFor(elementId);
      const selecting = ports.findPathMode();
      if (analysis === undefined || metadata === undefined || selecting.status !== 'selecting-target') return;
      const resolving = resolveFindPathTarget(selecting, metadata);
      if (resolving.status !== 'resolving-path') return;
      await resolveAndRenderPath(analysis, resolving, retryFindPathTarget(resolving), true);
    },

    async reverseFindPath() {
      const analysis = ports.analysis();
      const showing = ports.findPathMode();
      if (analysis === undefined || showing.status !== 'showing-path') return;
      const resolving = reverseFindPathResult(showing);
      if (resolving.status !== 'resolving-path') return;
      await resolveAndRenderPath(analysis, resolving, showing as ShowingFindPathMode, false);
    },

    cancelFindPath() {
      const mode = ports.findPathMode();
      generation++;
      if (rendering) ports.setLoading(false);
      rendering = false;
      if (mode.status === 'showing-path') restoreFindPathDiagram();
      ports.setFindPathMode(cancelFindPath(mode));
    },

    cancelIsolate() {
      generation++;
      if (rendering) ports.setLoading(false);
      rendering = false;
      restoreIsolateDiagram();
      ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
    },

    deploymentEnvironments() {
      const analysis = ports.analysis();
      const elementId = ports.pendingDeploymentElementId();
      return analysis === undefined || elementId === undefined
        ? []
        : deploymentEnvironmentsForElement(analysis, elementId);
    },

    async selectDeploymentEnvironment(environment) {
      const analysis = ports.analysis();
      const elementId = ports.pendingDeploymentElementId();
      if (elementId === undefined) return false;
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      if (analysis === undefined || environment === undefined) return true;
      await render(selectDeploymentGraph(analysis, elementId, environment), 'Show deployment');
      return true;
    },

    closeDeploymentPicker() {
      if (ports.pendingDeploymentElementId() === undefined) return false;
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      return true;
    },

    invalidateRender() {
      generation++;
      rendering = false;
      findPathDiagramSnapshot = undefined;
      isolateDiagramSnapshot = undefined;
      ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
    },

    reconcileAnalysis(analysis) {
      generation++;
      if (rendering) {
        rendering = false;
        ports.setLoading(false);
      }
      const mode = ports.findPathMode();
      const sourceMissing = mode.status !== 'idle'
        && analysis?.elements.some((element) => element.id === mode.sourceId) !== true;
      const targetMissing = (mode.status === 'resolving-path' || mode.status === 'showing-path')
        && analysis?.elements.some((element) => element.id === mode.targetId) !== true;
      if (sourceMissing || targetMissing) {
        controller.cancelFindPath();
        ports.info(`Find path was cancelled because the ${sourceMissing ? 'source' : 'target'} element is no longer available`);
      }
      const isolate = ports.isolateMode();
      if (isolate.status === 'showing-isolate'
          && analysis?.elements.some((element) => element.id === isolate.elementId) !== true) {
        controller.cancelIsolate();
        ports.info('Isolate was closed because the selected element is no longer available');
      }
      const pending = ports.pendingDeploymentElementId();
      if (pending !== undefined && analysis?.elements.some((element) => element.id === pending) !== true) {
        ports.setPendingDeploymentElementId(undefined);
        ports.setDeploymentPickerOpen(false);
      }
    },

    reset(reason) {
      const mode = ports.findPathMode();
      const isolate = ports.isolateMode();
      generation++;
      if (rendering) ports.setLoading(false);
      rendering = false;
      findPathDiagramSnapshot = undefined;
      isolateDiagramSnapshot = undefined;
      ports.setFindPathMode(idleFindPathMode);
      ports.setIsolateMode({ status: 'idle' });
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      if (reason === 'project-change' && mode.status !== 'idle') {
        ports.info('Find path was cancelled because the project changed');
      }
      if (reason === 'project-change' && isolate.status !== 'idle') {
        ports.info('Isolate was closed because the project changed');
      }
    }
  };

  return controller;
}
