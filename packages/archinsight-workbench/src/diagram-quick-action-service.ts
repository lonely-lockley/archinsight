import {
  deploymentEnvironmentsForElement,
  deploymentFocusElementIds,
  diagramElementOccurrenceEnvironment,
  diagramElementMetadata,
  diagramQuickActionMetadata,
  selectDeploymentGraph,
  selectElementDrillDown,
  selectIsolatedElementGraph,
  selectIsolatedRenderGraph,
  selectPathGraph,
  type DeploymentEnvironment,
  type DiagramElementQuickActionMetadata,
  type LinkProjectResult,
  type QueryScope,
  type RenderGraph,
} from '@insight/language';
import {
  beginDeployment,
  beginDrillDown,
  beginFindPath,
  beginIsolate,
  reverseFindPathResult,
  resolveFindPathTarget,
  showResolvedFindPath,
  type DeploymentMode,
  type FindPathMode,
  type IsolateMode,
} from './diagram-quick-actions.js';

export interface PreparedFindPath {
  readonly resolving: Extract<FindPathMode, { readonly status: 'resolving-path' }>;
  readonly showing: Extract<FindPathMode, { readonly status: 'showing-path' }>;
  readonly graph: RenderGraph;
}

export interface PreparedIsolate {
  readonly metadata: DiagramElementQuickActionMetadata;
  readonly mode: Extract<IsolateMode, { readonly status: 'showing-isolate' }>;
  readonly graph: RenderGraph;
}

export interface PreparedDrillDown {
  readonly metadata: DiagramElementQuickActionMetadata;
  readonly mode: Extract<IsolateMode, { readonly status: 'showing-drill-down' }>;
  readonly graph: RenderGraph;
}

export interface PreparedDeployment {
  readonly metadata: DiagramElementQuickActionMetadata;
  readonly mode: Extract<DeploymentMode, { readonly status: 'showing-deployment' }>;
  readonly graph: RenderGraph;
}

/** One semantic entry point shared by every diagram host. */
export class DiagramQuickActionService {
  private readonly metadataById;

  constructor(private readonly result: LinkProjectResult) {
    this.metadataById = diagramQuickActionMetadata(result);
  }

  metadata(elementId: string): DiagramElementQuickActionMetadata | undefined {
    return diagramElementMetadata(this.metadataById, elementId);
  }

  beginFindPath(elementId: string, scope: QueryScope, environment?: string): FindPathMode | undefined {
    const metadata = this.metadata(elementId);
    return metadata?.pathEligible === true
      ? beginFindPath(
          metadata,
          scope,
          diagramElementOccurrenceEnvironment(this.result, metadata.elementId, environment),
        )
      : undefined;
  }

  selectPathTarget(
    mode: FindPathMode,
    targetElementId: string,
    environment?: string,
  ): PreparedFindPath | undefined {
    const metadata = this.metadata(targetElementId);
    if (metadata === undefined) return undefined;
    return this.preparePath(resolveFindPathTarget(
      mode,
      metadata,
      diagramElementOccurrenceEnvironment(this.result, metadata.elementId, environment),
    ));
  }

  reversePath(mode: FindPathMode): PreparedFindPath | undefined {
    return this.preparePath(reverseFindPathResult(mode));
  }

  isolate(elementId: string, scope?: QueryScope): PreparedIsolate | undefined {
    const metadata = this.metadata(elementId);
    if (metadata?.isolateEligible !== true) return undefined;
    return {
      metadata,
      mode: beginIsolate(metadata) as Extract<IsolateMode, { readonly status: 'showing-isolate' }>,
      graph: selectIsolatedElementGraph(this.result, metadata.elementId, scope),
    };
  }

  isolateInGraph(elementId: string, graph: RenderGraph): PreparedIsolate | undefined {
    const metadata = this.metadata(elementId);
    if (metadata?.isolateEligible !== true) return undefined;
    return {
      metadata,
      mode: beginIsolate(metadata) as Extract<IsolateMode, { readonly status: 'showing-isolate' }>,
      graph: selectIsolatedRenderGraph(graph, metadata.elementId),
    };
  }

  drillDown(elementId: string): PreparedDrillDown | undefined {
    const metadata = this.metadata(elementId);
    if (metadata?.hasChildren !== true) return undefined;
    return {
      metadata,
      mode: beginDrillDown(metadata) as Extract<IsolateMode, { readonly status: 'showing-drill-down' }>,
      graph: selectElementDrillDown(this.result, metadata.elementId),
    };
  }

  deploymentEnvironments(elementId: string): readonly DeploymentEnvironment[] {
    const metadata = this.metadata(elementId);
    return metadata?.hasDeployment === true
      ? deploymentEnvironmentsForElement(this.result, metadata.canonicalElementId)
      : [];
  }

  deployment(elementId: string, environment: string): PreparedDeployment | undefined {
    const metadata = this.metadata(elementId);
    if (metadata?.hasDeployment !== true) return undefined;
    const graph = selectDeploymentGraph(this.result, metadata.canonicalElementId, environment);
    return {
      metadata,
      mode: beginDeployment(
        metadata,
        environment,
        deploymentFocusElementIds(this.result, metadata.canonicalElementId, graph),
      ) as Extract<DeploymentMode, { readonly status: 'showing-deployment' }>,
      graph,
    };
  }

  private preparePath(mode: FindPathMode): PreparedFindPath | undefined {
    if (mode.status !== 'resolving-path') return undefined;
    const showing = showResolvedFindPath(mode);
    if (showing.status !== 'showing-path') return undefined;
    return {
      resolving: mode,
      showing,
      graph: selectPathGraph(
        this.result,
        mode.sourceId,
        mode.targetId,
        mode.scope,
        {
          sourceEnvironment: mode.sourceEnvironment,
          targetEnvironment: mode.targetEnvironment,
        },
      ),
    };
  }
}
