import { queryViewPipeline, type BuiltinViewStage } from "./builtin-views.js";
import type { LinkProjectResult, QueryScope, RenderGraph } from "./contracts.js";

export interface QueryViewTransformations {
  applyBoundary(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  filterDeploymentSeeds(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  materializeGroups(graph: RenderGraph, materializePlacements: boolean): RenderGraph;
  applyEnvironment(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  rollUpSystems(result: LinkProjectResult, graph: RenderGraph, scope: QueryScope): RenderGraph;
  simplifyInfrastructure(result: LinkProjectResult, graph: RenderGraph): RenderGraph;
}

export function runQueryViewPipeline(
  result: LinkProjectResult,
  scope: QueryScope,
  selected: RenderGraph,
  transformations: QueryViewTransformations,
): RenderGraph {
  const pipeline = queryViewPipeline(scope.view, scope.pipeline);
  const hasStage = (stage: BuiltinViewStage): boolean => pipeline.stages.includes(stage);
  const bounded = transformations.applyBoundary(result, selected, scope);
  const seedFiltered = hasStage("deployment-seed-filter")
    ? transformations.filterDeploymentSeeds(result, bounded, scope)
    : bounded;
  const materialized = transformations.materializeGroups(
    seedFiltered,
    hasStage("deployment-materialization"),
  );
  if (hasStage("deployment-environment")) {
    return transformations.applyEnvironment(result, materialized, scope);
  }
  if (!hasStage("deployment-system-rollup")) {
    return materialized;
  }
  const rolledUp = transformations.rollUpSystems(result, materialized, scope);
  return hasStage("deployment-infrastructure-simplification")
    ? transformations.simplifyInfrastructure(result, rolledUp)
    : rolledUp;
}
