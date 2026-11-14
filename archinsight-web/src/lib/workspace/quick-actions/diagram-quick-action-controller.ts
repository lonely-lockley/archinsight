import {
  canonicalDiagramElementId,
  deploymentEnvironmentsForElement,
  deploymentFocusElementIds,
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
  beginDeployment,
  beginFindPath,
  beginIsolate,
  cancelDeployment,
  cancelIsolate,
  cancelFindPath,
  idleDeploymentMode,
  idleFindPathMode,
  reverseFindPathResult,
  resolveFindPathTarget,
  retryFindPathTarget,
  showResolvedFindPath,
  type DeploymentMode,
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
  deploymentMode(): DeploymentMode;
  setDeploymentMode(mode: DeploymentMode): void;
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
  cancelDeployment(): void;
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
  let generation = 0;
  let rendering = false;
  let findPathDiagramSnapshot: DiagramSnapshot | undefined;
  let isolateDiagramSnapshot: DiagramSnapshot | undefined;
  let deploymentDiagramSnapshot: DiagramSnapshot | undefined;
  let pendingDeploymentDiagramSnapshot: DiagramSnapshot | undefined;
  let findPathOwnerTabId: string | undefined;
  let findPathOwnerSourceIdentity: string | undefined;
  let isolateOwnerTabId: string | undefined;
  let isolateOwnerSourceIdentity: string | undefined;
  let deploymentOwnerTabId: string | undefined;
  let deploymentOwnerSourceIdentity: string | undefined;

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

  const currentPathEndpointEnvironment = (): string | undefined => {
    const tab = ports.activeTab();
    if (tab === undefined) return undefined;
    return resolveBuiltinView(tab.diagramMode, true)?.environment === 'single-relevant'
      ? tab.deploymentEnvironment
      : undefined;
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

  const restoreDeploymentDiagram = (): void => {
    if (deploymentDiagramSnapshot === undefined) return;
    ports.patchTab(deploymentDiagramSnapshot.tabId, deploymentDiagramSnapshot.patch);
    deploymentDiagramSnapshot = undefined;
  };

  const clearDeploymentOwnership = (): void => {
    deploymentOwnerTabId = undefined;
    deploymentOwnerSourceIdentity = undefined;
    pendingDeploymentDiagramSnapshot = undefined;
  };

  const renderDeployment = async (
    analysis: LinkProjectResult,
    metadata: NonNullable<ReturnType<typeof metadataFor>>,
    environment: string,
    snapshot: DiagramSnapshot | undefined
  ): Promise<boolean> => {
    const graph = selectDeploymentGraph(analysis, metadata.canonicalElementId, environment);
    const focusElementIds = deploymentFocusElementIds(analysis, metadata.canonicalElementId, graph);
    const accepted = await render(graph, 'Show deployment');
    if (!accepted) {
      if (ports.deploymentMode().status === 'idle') clearDeploymentOwnership();
      return false;
    }
    if (snapshot !== undefined) deploymentDiagramSnapshot = snapshot;
    ports.setDeploymentMode(beginDeployment(metadata, environment, focusElementIds));
    return true;
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
        currentQuickActionScope(analysis),
        {
          sourceEnvironment: resolving.sourceEnvironment,
          targetEnvironment: resolving.targetEnvironment
        }
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
        if (ports.deploymentMode().status !== 'idle') controller.cancelDeployment();
        if (ports.isolateMode().status !== 'idle') {
          restoreIsolateDiagram();
          ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
          isolateOwnerTabId = undefined;
          isolateOwnerSourceIdentity = undefined;
        }
        restoreFindPathDiagram();
        generation++;
        if (rendering) {
          rendering = false;
          ports.setLoading(false);
        }
        findPathOwnerTabId = ports.activeTab()?.id;
        findPathOwnerSourceIdentity = ports.activeTab()?.sourceIdentity;
        ports.setFindPathMode(beginFindPath(metadata, currentPathEndpointEnvironment()));
        return;
      }
      if (action === 'isolate') {
        if (!metadata.isolateEligible) return;
        if (ports.deploymentMode().status !== 'idle') controller.cancelDeployment();
        if (ports.findPathMode().status !== 'idle') {
          restoreFindPathDiagram();
          ports.setFindPathMode(cancelFindPath(ports.findPathMode()));
          findPathOwnerTabId = undefined;
          findPathOwnerSourceIdentity = undefined;
        }
        const ownerTab = ports.activeTab();
        const previousMode = ports.isolateMode();
        const snapshot = previousMode.status === 'idle' ? diagramSnapshot() : undefined;
        const accepted = await render(
          selectIsolatedElementGraph(analysis, metadata.canonicalElementId, currentQuickActionScope(analysis)),
          'Isolate'
        );
        if (accepted) {
          if (snapshot !== undefined) isolateDiagramSnapshot = snapshot;
          isolateOwnerTabId = ownerTab?.id;
          isolateOwnerSourceIdentity = ownerTab?.sourceIdentity;
          ports.setIsolateMode(beginIsolate(metadata));
        }
        return;
      }
      if (ports.findPathMode().status !== 'idle') controller.cancelFindPath();
      if (ports.isolateMode().status !== 'idle') {
        restoreIsolateDiagram();
        ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
        isolateOwnerTabId = undefined;
        isolateOwnerSourceIdentity = undefined;
      }
      if (!metadata.hasDeployment) return;
      const ownerTab = ports.activeTab();
      const continuesCurrentDeployment = ports.deploymentMode().status !== 'idle'
        && (deploymentOwnerTabId === undefined || deploymentOwnerTabId === ownerTab?.id);
      if (ports.deploymentMode().status !== 'idle' && !continuesCurrentDeployment) {
        controller.cancelDeployment();
      }
      const environments = deploymentEnvironmentsForElement(analysis, metadata.canonicalElementId);
      if (environments.length === 0) {
        ports.info(`No deployment is available for ${metadata.title}`);
        return;
      }
      if (environments.length > 1) {
        if (!continuesCurrentDeployment) {
          deploymentOwnerTabId = ownerTab?.id;
          deploymentOwnerSourceIdentity = ownerTab?.sourceIdentity;
          pendingDeploymentDiagramSnapshot = diagramSnapshot();
        } else {
          pendingDeploymentDiagramSnapshot = undefined;
        }
        ports.setPendingDeploymentElementId(metadata.canonicalElementId);
        ports.setDeploymentPickerOpen(true);
        return;
      }
      if (!continuesCurrentDeployment) {
        deploymentOwnerTabId = ownerTab?.id;
        deploymentOwnerSourceIdentity = ownerTab?.sourceIdentity;
      }
      await renderDeployment(
        analysis,
        metadata,
        environments[0]!.id,
        continuesCurrentDeployment ? undefined : diagramSnapshot()
      );
    },

    async selectPathTarget(elementId) {
      const analysis = ports.analysis();
      const metadata = metadataFor(elementId);
      const selecting = ports.findPathMode();
      if (analysis === undefined || metadata === undefined || selecting.status !== 'selecting-target') return;
      const resolving = resolveFindPathTarget(selecting, metadata, currentPathEndpointEnvironment());
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
      findPathOwnerTabId = undefined;
      findPathOwnerSourceIdentity = undefined;
      ports.setFindPathMode(cancelFindPath(mode));
    },

    cancelIsolate() {
      generation++;
      if (rendering) ports.setLoading(false);
      rendering = false;
      restoreIsolateDiagram();
      isolateOwnerTabId = undefined;
      isolateOwnerSourceIdentity = undefined;
      ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
    },

    cancelDeployment() {
      generation++;
      if (rendering) ports.setLoading(false);
      rendering = false;
      restoreDeploymentDiagram();
      clearDeploymentOwnership();
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      ports.setDeploymentMode(cancelDeployment(ports.deploymentMode()));
    },

    activeTabOwnsQuickActionMode(activeTabId) {
      if (ports.findPathMode().status !== 'idle') {
        return findPathOwnerTabId === undefined || findPathOwnerTabId === activeTabId;
      }
      if (ports.isolateMode().status !== 'idle') {
        return isolateOwnerTabId === undefined || isolateOwnerTabId === activeTabId;
      }
      if (ports.deploymentMode().status !== 'idle') {
        return deploymentOwnerTabId === undefined || deploymentOwnerTabId === activeTabId;
      }
      return true;
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
      const metadata = metadataFor(elementId);
      const snapshot = pendingDeploymentDiagramSnapshot;
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      pendingDeploymentDiagramSnapshot = undefined;
      if (analysis === undefined || metadata === undefined || environment === undefined) {
        if (ports.deploymentMode().status === 'idle') clearDeploymentOwnership();
        return true;
      }
      await renderDeployment(analysis, metadata, environment, snapshot);
      return true;
    },

    closeDeploymentPicker() {
      if (ports.pendingDeploymentElementId() === undefined) return false;
      ports.setPendingDeploymentElementId(undefined);
      ports.setDeploymentPickerOpen(false);
      pendingDeploymentDiagramSnapshot = undefined;
      if (ports.deploymentMode().status === 'idle') clearDeploymentOwnership();
      return true;
    },

    invalidateRender(sourceIdentity) {
      if (sourceIdentity !== undefined) {
        if (ports.findPathMode().status !== 'idle'
            && findPathOwnerSourceIdentity !== undefined
            && sourceIdentity !== findPathOwnerSourceIdentity) return;
        if (ports.isolateMode().status !== 'idle'
            && isolateOwnerSourceIdentity !== undefined
            && sourceIdentity !== isolateOwnerSourceIdentity) return;
        if (ports.deploymentMode().status !== 'idle'
            && deploymentOwnerSourceIdentity !== undefined
            && sourceIdentity !== deploymentOwnerSourceIdentity) return;
      }
      generation++;
      rendering = false;
      findPathDiagramSnapshot = undefined;
      isolateDiagramSnapshot = undefined;
      deploymentDiagramSnapshot = undefined;
      isolateOwnerTabId = undefined;
      isolateOwnerSourceIdentity = undefined;
      clearDeploymentOwnership();
      ports.setIsolateMode(cancelIsolate(ports.isolateMode()));
      ports.setDeploymentMode(cancelDeployment(ports.deploymentMode()));
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
      const deployment = ports.deploymentMode();
      if (deployment.status === 'showing-deployment'
          && analysis?.elements.some((element) => element.id === deployment.elementId) !== true) {
        controller.cancelDeployment();
        ports.info('Deployment was closed because the selected element is no longer available');
      }
      const pending = ports.pendingDeploymentElementId();
      if (pending !== undefined && analysis?.elements.some((element) => element.id === pending) !== true) {
        ports.setPendingDeploymentElementId(undefined);
        ports.setDeploymentPickerOpen(false);
        clearDeploymentOwnership();
      }
    },

    reset(reason) {
      const mode = ports.findPathMode();
      const isolate = ports.isolateMode();
      const deployment = ports.deploymentMode();
      generation++;
      if (rendering) ports.setLoading(false);
      rendering = false;
      findPathDiagramSnapshot = undefined;
      isolateDiagramSnapshot = undefined;
      deploymentDiagramSnapshot = undefined;
      pendingDeploymentDiagramSnapshot = undefined;
      findPathOwnerTabId = undefined;
      findPathOwnerSourceIdentity = undefined;
      isolateOwnerTabId = undefined;
      isolateOwnerSourceIdentity = undefined;
      deploymentOwnerTabId = undefined;
      deploymentOwnerSourceIdentity = undefined;
      ports.setFindPathMode(idleFindPathMode);
      ports.setIsolateMode({ status: 'idle' });
      ports.setDeploymentMode(idleDeploymentMode);
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
