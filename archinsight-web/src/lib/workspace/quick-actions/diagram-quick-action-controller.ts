import {
  canonicalDiagramElementId,
  renderGraphvizArtifact,
  resolveBuiltinView,
  type DeploymentEnvironment,
  type LinkProjectResult,
  type QueryScope,
  type RenderGraph,
  type RenderTheme
} from '@insight/language';
import {
  idleDeploymentMode,
  idleFindPathMode,
  idleIsolateMode,
  retryFindPathTarget,
  type DeploymentMode,
  type DiagramQuickActionResultMode,
  type DiagramQuickActionId,
  type FindPathMode,
  type IsolateMode
} from '@archinsight/workbench/diagram-quick-actions';
import {
  DiagramQuickActionService,
  type PreparedFindPath
} from '@archinsight/workbench/diagram-quick-action-service';
import {
  DiagramQuickActionCoordinator,
  DiagramQuickActionStack
} from '@archinsight/workbench/diagram-quick-action-coordinator';
import type { WorkspaceSurface } from '$lib/actions/action-model';
import type { DotRender, SvgRenderResponse } from '$lib/api';
import type { SourceLocation, WorkspaceTab } from '@archinsight/workbench/types';

type ResultPatch = Partial<Pick<WorkspaceTab, 'svg' | 'dot' | 'queryResult'>>;
type DiagramSnapshot = {
  readonly tabId: string;
  readonly sourceIdentity: string;
  readonly patch: ResultPatch;
};
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
  deploymentMode(): DeploymentMode;
  setDeploymentMode(mode: DeploymentMode): void;
  pendingDeploymentElementId(): string | undefined;
  setPendingDeploymentElementId(elementId: string | undefined): void;
  setDeploymentPickerOpen(open: boolean): void;
  setLoading(loading: boolean): void;
  patchTab(tabId: string, patch: ResultPatch): void;
  renderInBrowser(renders: DotRender[], signal?: AbortSignal): Promise<SvgRenderResponse>;
  renderOnServer(projectId: string, renders: DotRender[], surface: WorkspaceSurface, signal?: AbortSignal): Promise<SvgRenderResponse>;
  goToDeclaration(location: SourceLocation): Promise<void> | void;
  info(message: string): void;
  error(message: string): void;
};

export type DiagramQuickActionController = {
  execute(action: DiagramQuickActionId, elementId: string): Promise<void>;
  selectPathTarget(elementId: string): Promise<void>;
  reverseFindPath(): Promise<void>;
  cancelFindPath(): void;
  backQuickAction(): void;
  closeQuickActions(): void;
  activeTabOwnsQuickActionMode(activeTabId: string | undefined): boolean;
  deploymentEnvironments(): readonly DeploymentEnvironment[];
  selectDeploymentEnvironment(environment: string | undefined): Promise<boolean>;
  closeDeploymentPicker(): boolean;
  invalidateRender(sourceIdentity?: string): void;
  reconcileAnalysis(analysis: LinkProjectResult | undefined): void;
  reset(reason?: 'project-change'): void;
};

export function createDiagramQuickActionController(
  ports: DiagramQuickActionControllerPorts
): DiagramQuickActionController {
  let rendering = false;
  let renderAbort: AbortController | undefined;
  const lifecycle = new DiagramQuickActionCoordinator();
  const scopedResults = new DiagramQuickActionStack<DiagramSnapshot, RenderGraph>();
  lifecycle.setFindPathMode(ports.findPathMode());
  lifecycle.setIsolateMode(ports.isolateMode());
  lifecycle.setDeploymentMode(ports.deploymentMode());
  let pendingDeploymentDiagramSnapshot: DiagramSnapshot | undefined;
  let pendingDeploymentReplacesCurrent = false;
  const hostPorts = ports;
  ports = {
    ...hostPorts,
    findPathMode: () => lifecycle.findPathMode(),
    setFindPathMode: (mode) => {
      lifecycle.setFindPathMode(mode);
      hostPorts.setFindPathMode(mode);
    },
    isolateMode: () => lifecycle.isolateMode(),
    setIsolateMode: (mode) => {
      lifecycle.setIsolateMode(mode);
      hostPorts.setIsolateMode(mode);
    },
    deploymentMode: () => lifecycle.deploymentMode(),
    setDeploymentMode: (mode) => {
      lifecycle.setDeploymentMode(mode);
      hostPorts.setDeploymentMode(mode);
    }
  };

  const metadataFor = (elementId: string) => {
    const analysis = ports.analysis();
    return analysis === undefined
      ? undefined
      : new DiagramQuickActionService(analysis).metadata(elementId);
  };

  const diagramSnapshot = (): DiagramSnapshot | undefined => {
    const tab = ports.activeTab();
    return tab === undefined ? undefined : {
      tabId: tab.id,
      sourceIdentity: tab.sourceIdentity,
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

  const currentPathEndpointEnvironment = (): string | undefined => {
    const tab = ports.activeTab();
    if (tab === undefined) return undefined;
    return resolveBuiltinView(tab.diagramMode, true)?.environment === 'single-relevant'
      ? tab.deploymentEnvironment
      : undefined;
  };

  const setResultMode = (mode: DiagramQuickActionResultMode | undefined): void => {
    ports.setFindPathMode(mode?.status === 'showing-path' ? mode : idleFindPathMode);
    ports.setIsolateMode(
      mode?.status === 'showing-isolate' || mode?.status === 'showing-drill-down'
        ? mode
        : idleIsolateMode
    );
    ports.setDeploymentMode(mode?.status === 'showing-deployment' ? mode : idleDeploymentMode);
  };

  const popScopedDiagram = (): boolean => {
    const previous = scopedResults.pop();
    if (previous === undefined) {
      setResultMode(undefined);
      return false;
    }
    ports.patchTab(previous.snapshot.tabId, previous.snapshot.patch);
    setResultMode(previous.mode);
    return true;
  };

  const clearScopedDiagrams = (): void => {
    const baselines = new Map<string, DiagramSnapshot>();
    for (const frame of scopedResults.clearFrames()) {
      if (!baselines.has(frame.snapshot.tabId)) baselines.set(frame.snapshot.tabId, frame.snapshot);
    }
    for (const baseline of baselines.values()) ports.patchTab(baseline.tabId, baseline.patch);
    setResultMode(undefined);
    lifecycle.clear('find-path');
    lifecycle.clear('isolate');
    lifecycle.clear('deployment');
  };

  const clearPendingDeployment = (): void => {
    pendingDeploymentDiagramSnapshot = undefined;
    pendingDeploymentReplacesCurrent = false;
  };

  const renderDeployment = async (
    analysis: LinkProjectResult,
    metadata: NonNullable<ReturnType<typeof metadataFor>>,
    environment: string,
    snapshot: DiagramSnapshot | undefined,
    replaceCurrent: boolean
  ): Promise<boolean> => {
    const prepared = new DiagramQuickActionService(analysis).deployment(metadata.canonicalElementId, environment);
    if (prepared === undefined) return false;
    const accepted = await render(prepared.graph, 'Show deployment');
    if (!accepted) return false;
    if (replaceCurrent) {
      scopedResults.replaceCurrent(prepared.mode, prepared.graph);
    } else if (snapshot !== undefined) {
      scopedResults.push({ mode: prepared.mode, snapshot, projection: prepared.graph });
    } else {
      return false;
    }
    setResultMode(prepared.mode);
    return true;
  };

  const render = async (graph: RenderGraph, label: string): Promise<boolean> => {
    const analysis = ports.analysis();
    const tab = ports.activeTab();
    if (analysis === undefined || tab === undefined) return false;
    renderAbort?.abort();
    const controller = new AbortController();
    renderAbort = controller;
    const currentGeneration = lifecycle.nextGeneration();
    const projectId = ports.projectId();
    rendering = true;
    ports.setLoading(true);
    try {
      const artifact = renderGraphvizArtifact(analysis, graph, ports.theme());
      const renders: DotRender[] = [{ sourceIdentity: tab.sourceIdentity, diagram: 'query', ...artifact }];
      let rendered: SvgRenderResponse;
      try {
        rendered = await ports.renderInBrowser(renders, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw error;
        rendered = await ports.renderOnServer(projectId, renders, ports.surface(), controller.signal);
      }
      if (!lifecycle.isCurrent(currentGeneration) || ports.projectId() !== projectId) {
        return false;
      }
      const error = rendered.diagnostics.find((diagnostic) => diagnostic.level === 'ERROR');
      const svg = rendered.svgs.find((item) => item.sourceIdentity === tab.sourceIdentity)?.svg;
      if (error !== undefined || svg === undefined) {
        ports.error(error?.message ?? `Renderer returned no SVG for ${label}`);
        return false;
      }
      ports.patchTab(tab.id, { svg, dot: artifact.dot, queryResult: undefined });
      return true;
    } catch (error) {
      if (lifecycle.isCurrent(currentGeneration)) {
        ports.error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    } finally {
      if (lifecycle.isCurrent(currentGeneration)) {
        renderAbort = undefined;
        rendering = false;
        ports.setLoading(false);
      }
    }
  };

  const resolveAndRenderPath = async (
    prepared: PreparedFindPath,
    failureMode: FindPathMode,
    replaceCurrent: boolean
  ): Promise<void> => {
    const { resolving, showing, graph } = prepared;
    const snapshot = replaceCurrent ? undefined : diagramSnapshot();
    ports.setFindPathMode(resolving);
    if (graph.edges.length === 0) {
      const message = `No path found between ${resolving.sourceTitle} and ${resolving.targetTitle}.`;
      ports.info(message);
    }
    if (ports.findPathMode() !== resolving) return;
    const accepted = await render(graph, 'Find path');
    if (accepted) {
      if (replaceCurrent) {
        scopedResults.replaceCurrent(showing, graph);
      } else if (snapshot !== undefined) {
        scopedResults.push({ mode: showing, snapshot, projection: graph });
      } else {
        return;
      }
      lifecycle.clear('find-path');
      setResultMode(showing);
    }
    if (!accepted && ports.findPathMode() === resolving) {
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
        lifecycle.invalidate();
        renderAbort?.abort();
        renderAbort = undefined;
        if (rendering) {
          rendering = false;
          ports.setLoading(false);
        }
        lifecycle.begin('find-path', {
          id: ports.activeTab()?.id,
          sourceIdentity: ports.activeTab()?.sourceIdentity
        });
        const scope = currentQuickActionScope(analysis);
        if (scope === undefined) return;
        const mode = new DiagramQuickActionService(analysis).beginFindPath(
          metadata.canonicalElementId, scope, currentPathEndpointEnvironment()
        );
        if (mode !== undefined) {
          ports.setIsolateMode(idleIsolateMode);
          ports.setDeploymentMode(idleDeploymentMode);
          ports.setFindPathMode(mode);
        }
        return;
      }
      if (action === 'drill-down' || action === 'isolate') {
        if (action === 'drill-down' ? !metadata.hasChildren : !metadata.isolateEligible) return;
        if (ports.findPathMode().status === 'selecting-target'
            || ports.findPathMode().status === 'resolving-path') {
          controller.cancelFindPath();
        }
        const snapshot = diagramSnapshot();
        if (snapshot === undefined) return;
        const service = new DiagramQuickActionService(analysis);
        const prepared = action === 'drill-down'
          ? service.drillDown(metadata.elementId)
          : scopedResults.currentProjection() === undefined
            ? service.isolate(metadata.elementId, currentQuickActionScope(analysis))
            : service.isolateInGraph(metadata.elementId, scopedResults.currentProjection()!);
        if (prepared === undefined) return;
        const accepted = await render(prepared.graph, action === 'drill-down' ? 'Drill down' : 'Isolate');
        if (accepted) {
          scopedResults.push({ mode: prepared.mode, snapshot, projection: prepared.graph });
          setResultMode(prepared.mode);
        }
        return;
      }
      if (ports.findPathMode().status === 'selecting-target'
          || ports.findPathMode().status === 'resolving-path') {
        controller.cancelFindPath();
      }
      if (!metadata.hasDeployment) return;
      const currentMode = scopedResults.currentMode();
      const continuesCurrentDeployment = currentMode?.status === 'showing-deployment'
        && currentMode.elementId === metadata.canonicalElementId;
      const environments = new DiagramQuickActionService(analysis)
        .deploymentEnvironments(metadata.canonicalElementId);
      if (environments.length === 0) {
        ports.info(`No deployment is available for ${metadata.title}`);
        return;
      }
      if (environments.length > 1) {
        pendingDeploymentDiagramSnapshot = continuesCurrentDeployment ? undefined : diagramSnapshot();
        pendingDeploymentReplacesCurrent = continuesCurrentDeployment;
        ports.setPendingDeploymentElementId(metadata.canonicalElementId);
        ports.setDeploymentPickerOpen(true);
        return;
      }
      await renderDeployment(
        analysis,
        metadata,
        environments[0]!.id,
        continuesCurrentDeployment ? undefined : diagramSnapshot(),
        continuesCurrentDeployment
      );
    },

    async selectPathTarget(elementId) {
      const analysis = ports.analysis();
      const metadata = metadataFor(elementId);
      const selecting = ports.findPathMode();
      if (analysis === undefined || metadata === undefined || selecting.status !== 'selecting-target') return;
      try {
        const prepared = new DiagramQuickActionService(analysis)
          .selectPathTarget(selecting, metadata.canonicalElementId, currentPathEndpointEnvironment());
        if (prepared === undefined) return;
        await resolveAndRenderPath(prepared, retryFindPathTarget(prepared.resolving), false);
      } catch (error) {
        ports.error(`Find path failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    async reverseFindPath() {
      const analysis = ports.analysis();
      const showing = ports.findPathMode();
      if (analysis === undefined || showing.status !== 'showing-path') return;
      try {
        const prepared = new DiagramQuickActionService(analysis).reversePath(showing);
        if (prepared === undefined) return;
        await resolveAndRenderPath(prepared, showing as ShowingFindPathMode, true);
      } catch (error) {
        ports.error(`Find path failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },

    cancelFindPath() {
      const mode = ports.findPathMode();
      if (mode.status === 'showing-path') {
        controller.backQuickAction();
        return;
      }
      lifecycle.invalidate();
      renderAbort?.abort();
      renderAbort = undefined;
      if (rendering) ports.setLoading(false);
      rendering = false;
      lifecycle.clear('find-path');
      setResultMode(scopedResults.currentMode());
    },

    backQuickAction() {
      lifecycle.invalidate();
      renderAbort?.abort();
      renderAbort = undefined;
      if (rendering) ports.setLoading(false);
      rendering = false;
      popScopedDiagram();
    },

    closeQuickActions() {
      lifecycle.invalidate();
      renderAbort?.abort();
      renderAbort = undefined;
      if (rendering) ports.setLoading(false);
      rendering = false;
      clearPendingDeployment();
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      clearScopedDiagrams();
    },

    activeTabOwnsQuickActionMode(activeTabId) {
      if (ports.findPathMode().status === 'selecting-target'
          || ports.findPathMode().status === 'resolving-path') {
        return lifecycle.owns('find-path', activeTabId);
      }
      const mode = scopedResults.currentMode();
      return mode === undefined || scopedResults.currentSnapshot()?.tabId === activeTabId;
    },

    deploymentEnvironments() {
      const analysis = ports.analysis();
      const elementId = ports.pendingDeploymentElementId();
      return analysis === undefined || elementId === undefined
        ? []
        : new DiagramQuickActionService(analysis).deploymentEnvironments(elementId);
    },

    async selectDeploymentEnvironment(environment) {
      const analysis = ports.analysis();
      const elementId = ports.pendingDeploymentElementId();
      if (elementId === undefined) return false;
      const metadata = metadataFor(elementId);
      const snapshot = pendingDeploymentDiagramSnapshot;
      const replaceCurrent = pendingDeploymentReplacesCurrent;
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      clearPendingDeployment();
      if (analysis === undefined || metadata === undefined || environment === undefined) {
        return true;
      }
      await renderDeployment(analysis, metadata, environment, snapshot, replaceCurrent);
      return true;
    },

    closeDeploymentPicker() {
      if (ports.pendingDeploymentElementId() === undefined) return false;
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      clearPendingDeployment();
      return true;
    },

    invalidateRender(sourceIdentity) {
      if (sourceIdentity !== undefined) {
        const interaction = ports.findPathMode();
        if ((interaction.status === 'selecting-target' || interaction.status === 'resolving-path')
            && !lifecycle.belongsToSource('find-path', sourceIdentity)) return;
        const currentMode = scopedResults.currentMode();
        if (currentMode !== undefined
            && scopedResults.currentSnapshot()?.sourceIdentity !== sourceIdentity) return;
      }
      lifecycle.invalidate();
      renderAbort?.abort();
      renderAbort = undefined;
      rendering = false;
      lifecycle.reset();
      scopedResults.clear();
      clearPendingDeployment();
      setResultMode(undefined);
    },

    reconcileAnalysis(analysis) {
      lifecycle.invalidate();
      renderAbort?.abort();
      renderAbort = undefined;
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
      if (isolate.status !== 'idle'
          && analysis?.elements.some((element) => element.id === isolate.elementId) !== true) {
        controller.backQuickAction();
        ports.info(`${isolate.status === 'showing-drill-down' ? 'Drill down' : 'Isolate'} was closed because the selected element is no longer available`);
      }
      const deployment = ports.deploymentMode();
      if (deployment.status === 'showing-deployment'
          && analysis?.elements.some((element) => element.id === deployment.elementId) !== true) {
        controller.backQuickAction();
        ports.info('Deployment was closed because the selected element is no longer available');
      }
      const pending = ports.pendingDeploymentElementId();
      if (pending !== undefined && analysis?.elements.some((element) => element.id === pending) !== true) {
        ports.setPendingDeploymentElementId(undefined);
        ports.setDeploymentPickerOpen(false);
        clearPendingDeployment();
      }
    },

    reset(reason) {
      const mode = ports.findPathMode();
      const isolate = ports.isolateMode();
      const deployment = ports.deploymentMode();
      lifecycle.invalidate();
      renderAbort?.abort();
      renderAbort = undefined;
      if (rendering) ports.setLoading(false);
      rendering = false;
      clearPendingDeployment();
      scopedResults.clear();
      lifecycle.reset();
      setResultMode(undefined);
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      if (reason === 'project-change' && mode.status !== 'idle') {
        ports.info('Find path was cancelled because the project changed');
      }
      if (reason === 'project-change' && isolate.status !== 'idle') {
        ports.info('Isolate was closed because the project changed');
      }
      if (reason === 'project-change' && deployment.status !== 'idle') {
        ports.info('Deployment was closed because the project changed');
      }
    }
  };

  return controller;
}
